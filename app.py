import openai
from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, text
import uuid
import os
from dotenv import load_dotenv
import urllib.parse

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["https://nice-hill-06bb87c0f.4.azurestaticapps.net", "https://victorious-plant-018c0aa0f.4.azurestaticapps.net"]}})
#CORS(app, resources={r"/*": {"origins": ["https://nice-hill-06bb87c0f.4.azurestaticapps.net", "https://victorious-plant-018c0aa0f.4.azurestaticapps.net"]}})

# Azure Open AI setup
openai.api_key = os.getenv("AZURE_OPENAI_KEY")
openai.api_base = os.getenv("AZURE_OPENAI_ENDPOINT")
openai.api_type = "azure"
openai.api_version = "2024-10-21"  # or whichever API version you're using
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT")

# Database credentials
server = os.getenv("SQL_SERVER")
database = os.getenv("SQL_DATABASE")
username = os.getenv("SQL_USERNAME")
password = os.getenv("SQL_PASSWORD")

# ODBC driver
driver = 'ODBC Driver 18 for SQL Server'

if not all([server, database, username, password]):
    raise ValueError("Database configuration not fully provided.")

# Build ODBC connection string
odbc_conn_str = (
    f'DRIVER={{{driver}}};'
    f'SERVER={server};'
    f'PORT=1433;'
    f'DATABASE={database};'
    f'UID={username};'
    f'PWD={password};'
    f'Encrypt=yes;'
    f'TrustServerCertificate=no;'
    f'Connection Timeout=30;'
)

# URL-encode
odbc_conn_str_encoded = urllib.parse.quote_plus(odbc_conn_str)

# Create SQLAlchemy engine
connection_string = f"mssql+pyodbc:///?odbc_connect={odbc_conn_str_encoded}"
engine = create_engine(connection_string)


def get_feature_comparison_from_db():
    """
    Fetches a table called 'FeatureComparison_Detailed' from your DB
    and returns a Markdown-friendly table string.
    """
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT * FROM FeatureComparison_Detailed"))

            table = "| Feature               | Azure AI Search | Azure Cosmos DB NoSQL | Azure Cosmos DB MongoDB vCore  | Azure SQL DB     | Azure PostgreSQL |\n"
            table += "|-----------------------|-----------------|----------------------|--------------------------------|------------------|------------------|\n"

            for row in result:
                row_data = row._mapping
                table += (
                    f"| {row_data['Feature']} | {row_data['AI_Search']} "
                    f"| {row_data['Azure_Cosmos_DB_NoSQL']} | {row_data['Azure_Cosmos_DB_MongoDB_vCore']} | {row_data['Azure_SQL_DB']} "
                    f"| {row_data['Azure_PostgreSQL']} |\n"
                )

            return table
    except Exception as e:
        print("Error fetching feature comparison:", str(e))
        return "Error fetching the feature comparison table."


# ----------------------------- QUESTIONS ENDPOINT -----------------------------
@app.route('/questions', methods=['GET'])
def get_questions():
    """
    Fetch the question list from new_questions3 table.
    """
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT * FROM new_questions3"))
            questions = [dict(row._mapping) for row in result]
        return jsonify(questions)
    except Exception as e:
        print("Error fetching questions:", str(e))
        return jsonify({"error": "An error occurred while fetching questions."}), 500


# ----------------------------- SUBMIT ENDPOINT -----------------------------
@app.route('/submit', methods=['POST'])
def submit_responses():
    """
    Saves the user's questionnaire responses into the 'responses' table,
    generates a session_id, determines a session_name (if possible),
    and stores that in the response.
    """
    data = request.json
    session_id = str(uuid.uuid4())  # unique session

    # We'll look for these pieces of info among the responses
    company_name = None
    use_case = None

    try:
        with engine.begin() as connection:
            for response in data:
                question_text = response.get('question')
                answer_text = response.get('answer')
                question_id = response.get('question_id')

                if not question_text or answer_text is None:
                    continue

                # 1) Insert into 'responses'
                insert_query = text('''
                    INSERT INTO responses (question_id, response_text, session_id)
                    VALUES (:question_id, :response_text, :session_id)
                ''')
                connection.execute(insert_query, {
                    'question_id': question_id,
                    'response_text': answer_text,
                    'session_id': session_id
                })

                # 2) Identify special questions by text
                if "Customer Name" in question_text:
                    company_name = answer_text.strip()

                if "use cases" in question_text:
                    use_case = answer_text.strip()

        # 3) Build a session_name
        from datetime import datetime
        date_str = datetime.utcnow().strftime("%Y-%m-%d")
        if company_name and use_case:
            session_name = f"{company_name} - {use_case} - {date_str}"
        elif company_name:
            session_name = f"{company_name} - {date_str}"
        elif use_case:
            session_name = f"{use_case} - {date_str}"
        else:
            session_name = session_id

        # Return the session_id and session_name to the front-end
        return jsonify({
            "message": "Responses saved successfully!",
            "session_id": session_id,
            "session_name": session_name
        })
    except Exception as e:
        print("Error occurred while saving responses:", str(e))
        return jsonify({"error": "An error occurred while saving responses."}), 500


# ----------------------------- FOLLOWUP ENDPOINT -----------------------------
@app.route('/followup', methods=['POST'])
def followup():
    """
    Additional user follow-up questions after the recommendation is generated.
    """
    data = request.json
    session_id = data.get("session_id")
    user_message = data.get("message")

    if not session_id or not user_message:
        return jsonify({"error": "session_id and message are required."}), 400

    # Check how many followups so far
    with engine.connect() as connection:
        followup_count_result = connection.execute(text("""
            SELECT COUNT(*) as cnt FROM FollowUps WHERE session_id = :session_id
        """), {'session_id': session_id}).fetchone()
        followup_count = followup_count_result.cnt if followup_count_result else 0

        if followup_count >= 20:
            return jsonify({"error": "Maximum of 20 follow-up questions reached."}), 400

    # Retrieve original Q&A and recommendation
    with engine.connect() as connection:
        qa_results = connection.execute(text("""
            SELECT q.Question, r.response_text
            FROM responses r
            JOIN new_questions3 q ON r.question_id = q.id
            WHERE r.session_id = :session_id AND r.question_id != -1
        """), {'session_id': session_id}).fetchall()

        free_form_result = connection.execute(text("""
            SELECT response_text FROM responses
            WHERE session_id = :session_id AND question_id = -1
        """), {'session_id': session_id}).fetchone()
        free_form = free_form_result.response_text if free_form_result else ""

        llm_resp_result = connection.execute(text("""
            SELECT prompt, response_text
            FROM LLMResponses
            WHERE session_id = :session_id
        """), {'session_id': session_id}).fetchone()
        original_prompt = llm_resp_result.prompt if llm_resp_result else ""
        recommendation = llm_resp_result.response_text if llm_resp_result else ""

        prev_followups = connection.execute(text("""
            SELECT user_message, assistant_message
            FROM FollowUps
            WHERE session_id = :session_id
            ORDER BY id ASC
        """), {'session_id': session_id}).fetchall()

    # Build conversation
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert recommendation system for data storage in the context of Intelligent Applications. "
                "Provide guidance based on the previously given recommendation and Q&As. "
                "Do not repeat the entire recommendation unless asked. "
                "Do not answer topics not related to AI or Data Storage."
            )
        },
        {
            "role": "user",
            "content": (
                f"Original prompt:\n\n{original_prompt}\n\n"
                "Initial Q&A responses:\n"
                + "\n".join([f"{row.Question}: {row.response_text}" for row in qa_results])
                + f"\n\nFree-form details: {free_form}\n\n"
                "Previous recommendation:\n"
                + recommendation
            )
        }
    ]

    for fup in prev_followups:
        messages.append({"role": "user", "content": fup.user_message})
        messages.append({"role": "assistant", "content": fup.assistant_message})

    # Add the new user follow-up
    messages.append({"role": "user", "content": user_message})

    try:
        response = openai.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=messages,
            max_tokens=1000,
            temperature=0.7
        )
        followup_answer = response.choices[0].message.content.strip()
    except Exception as e:
        print("Error calling Azure OpenAI:", str(e))
        return jsonify({"error": "Error with Azure OpenAI generation."}), 500

    # Save the new followup
    try:
        with engine.begin() as connection:
            insert_query = text('''
                INSERT INTO FollowUps (session_id, user_message, assistant_message)
                VALUES (:session_id, :user_message, :assistant_message)
            ''')
            connection.execute(insert_query, {
                'session_id': session_id,
                'user_message': user_message,
                'assistant_message': followup_answer
            })
    except Exception as e:
        print("Error saving followup:", str(e))

    return jsonify({"answer": followup_answer})


# ----------------------------- RECOMMENDATION ENDPOINT -----------------------------
@app.route('/recommendation', methods=['POST'])
def get_recommendation():
    """
    Generates a final recommendation using Azure OpenAI
    based on questionnaire responses + optional top5 features.
    """
    try:
        data = request.json
        responses = data.get("responses", [])
        session_id = data.get("session_id")
        top5_features = data.get("top5_features", [])

        # free-form response
        free_form_response = ""
        for r in responses:
            if r.get("question_id") == -1:
                free_form_response = r.get("answer", "")

        feature_table = get_feature_comparison_from_db()

        database_resources = """
        Resources for Azure AI Search:
        - Accelerator: 
            - https://github.com/Azure-Samples/chat-with-your-data-solution-accelerator
            - https://github.com/Azure-Samples/azure-search-openai-demo
            - https://github.com/Azure-Samples/aisearch-openai-rag-audio
        - Internal resources for AI Design Win: https://microsoft.sharepoint.com/sites/AIDesignWins

        Resources for Azure Cosmos DB:
        - Accelerator Chat Application: https://github.com/AzureCosmosDB/cosmosdb-nosql-copilot
        - Accelerator for Multi-Agents:
            - https://github.com/microsoft/Multi-Agent-Custom-Automation-Engine-Solution-Accelerator
            - https://github.com/AzureCosmosDB/multi-agent-swarm/
        - Azure Cosmos DB - Generative AI Gallery: https://azurecosmosdb.github.io/gallery/?tags=generativeai
        - Database Experts: [Email Me](mailto:catdb@microsoft.com)
        - Internal resources for AI Design Win: https://microsoft.sharepoint.com/sites/AIDesignWins

        Resources for Azure SQL Database:
        - Accelerator: https://github.com/Azure-Samples/SQL-AI-samples
        - Samples: https://github.com/Azure-Samples/azure-sql-db-vector-search/tree/main
        - Database Experts: [Email Me](mailto:catdb@microsoft.com)
        - Internal resources for AI Design Win: https://microsoft.sharepoint.com/sites/AIDesignWins

        Resources for Azure PostgreSQL:
        - Accelerator RAG application: https://github.com/Azure-Samples/rag-postgres-openai-python
        - Accelerator GraphRAG: https://github.com/Azure-Samples/graphrag-legalcases-postgres/
        - Accelerator Advanced AI Copilot with Postgres (AI-driven data validation, vector search, DiskANN, semantic re-ranking, LangChain agent/tools framework, and GraphRAG on Azure Database for PostgreSQL): https://github.com/Azure-Samples/postgres-sa-byoac 
        - Accelerator PostgreSQL Solution Accelerator (FSI Scenario using structured and unstructured data): https://github.com/solliancenet/microsoft-postgresql-solution-accelerator-build-your-own-ai-copilot
        - Samples to learn how to use Semantic Ranker: https://github.com/microsoft/Semantic-Ranker-Solution-PostgreSQL
        https://github.com/Azure-Samples/postgres-sa-byoac
        - Database Experts: [Email Me](mailto:catdb@microsoft.com)
        - Internal resources for AI Design Win: https://microsoft.sharepoint.com/sites/AIDesignWins
        """

        # Build prompt
        prompt = "The user has completed a questionnaire.\nHere are their responses:\n"
        for resp in responses:
            question = resp.get('question')
            answer = resp.get('answer')
            prompt += f"- {question}: {answer}\n"

        if top5_features:
            prompt += "\nThey identified these TOP 5 Requirements:\n"
            for idx, feat in enumerate(top5_features, 1):
                prompt += f"#{idx}: {feat}\n"

        if free_form_response:
            prompt += f"\nAdditional free-form details:\n{free_form_response}\n"

        prompt += f"""
        Provide a personalized recommendation between Azure AI Search, Azure SQL Database, Azure Cosmos DB, and Azure PostgreSQL for each scenario that the user has selected.
        Try to use the same data source across scenarios if possible. Include relevant resources.

        Use this feature comparison for reference:\n\n{feature_table}\n\n{database_resources}

        Databases are preferred for vector indexes and Knowledge Base when:
        - You have structured or semi-structured operational data (e.g., chat history, customer profiles, business transactions) in that database.
        - Simplified architecture for a single source of truth, combining vector similarity search inline with database queries.
        - The workload benefits from mission-critical OLTP database characteristics.
        AI Search is preferred for vector indexes when:
        - You need to index structured/unstructured data (e.g., images, docx, PDFs) from various sources.
        - Your application requires state-of-the-art search technology.
        - The workload requires multi-modal search and/or embeddings.
        - You're building a Bing-like search experience.

        {feature_table}

        {database_resources}

        Finally, you should ask follow-up questions at the end of your recommendation. 
        For example, what framework does the customer use? Do they have an existing database skill/preference? But most important, use your judgement based on the application and data scenarios used.
        """

        print("LLM Prompt:\n", prompt)

        response = openai.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert data storage recommendation system. Be concise and helpful."
                    )
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            temperature=1
        )
        recommendation = response.choices[0].message.content.strip()

        # Save LLM response
        try:
            with engine.begin() as connection:
                insert_query = text('''
                    INSERT INTO LLMResponses (session_id, prompt, response_text)
                    VALUES (:session_id, :prompt, :response_text)
                ''')
                connection.execute(insert_query, {
                    'session_id': session_id,
                    'prompt': prompt,
                    'response_text': recommendation
                })
        except Exception as e:
            print("Error saving LLM response:", str(e))

        return jsonify({"recommendation": recommendation})
    except Exception as e:
        print("Error generating recommendation:", str(e))
        return jsonify({"error": "An error occurred while generating the recommendation."}), 500

# ----------------------------- FEEDBACK ENDPOINT -----------------------------
@app.route('/feedback', methods=['POST'])
def submit_feedback():
    """
    Records user feedback (thumbs_up or thumbs_down) for the final recommendation,
    plus optional comments.
    """
    try:
        data = request.json
        session_id = data.get('session_id')
        feedback = data.get('feedback')
        comments = data.get('comments', None)

        if not session_id or not feedback:
            return jsonify({"error": "Session ID and feedback are required"}), 400

        with engine.begin() as connection:
            insert_query = text('''
                INSERT INTO Feedback (session_id, feedback, comments)
                VALUES (:session_id, :feedback, :comments)
            ''')
            connection.execute(insert_query, {
                'session_id': session_id,
                'feedback': feedback,
                'comments': comments
            })

        return jsonify({"message": "Feedback recorded successfully!"})
    except Exception as e:
        print("Error saving feedback:", str(e))
        return jsonify({"error": "An error occurred while saving feedback."}), 500


# ----------------------------- RECORD LOGIN/LOGOUT -----------------------------
@app.route('/recordLogin', methods=['POST'])
def record_login():
    data = request.json
    email = data.get("email")
    if not email:
        return jsonify({"error": "Email is required"}), 400

    try:
        with engine.begin() as connection:
            query = text("""
                INSERT INTO Connections (email, event_type)
                VALUES (:email, 'login')
            """)
            connection.execute(query, {"email": email})
        return jsonify({"message": "Login recorded"}), 200
    except Exception as e:
        print("Error recording login:", str(e))
        return jsonify({"error": "Could not record login"}), 500


@app.route('/recordLogout', methods=['POST'])
def record_logout():
    data = request.json
    email = data.get("email")
    if not email:
        return jsonify({"error": "Email is required"}), 400

    try:
        with engine.begin() as connection:
            query = text("""
                INSERT INTO Connections (email, event_type)
                VALUES (:email, 'logout')
            """)
            connection.execute(query, {"email": email})
        return jsonify({"message": "Logout recorded"}), 200
    except Exception as e:
        print("Error recording logout:", str(e))
        return jsonify({"error": "Could not record logout"}), 500


@app.route('/recordSession', methods=['POST'])
def record_session():
    """
    Tracks session creation in the Connections table with event_type='session_created'.
    """
    data = request.json
    email = data.get("email")
    session_id = data.get("session_id")
    session_name = data.get("session_name", None)

    if not email or not session_id:
        return jsonify({"error": "Email and session_id are required"}), 400

    try:
        with engine.begin() as connection:
            query = text("""
                INSERT INTO Connections (email, event_type, session_id, session_name)
                VALUES (:email, 'session_created', :session_id, :session_name)
            """)
            connection.execute(query, {
                "email": email,
                "session_id": session_id,
                "session_name": session_name
            })
        return jsonify({"message": "Session recorded"}), 200
    except Exception as e:
        print("Error recording session:", str(e))
        return jsonify({"error": "Could not record session"}), 500


# ----------------------------- FEATURE RANKING -----------------------------
@app.route('/featureRanking', methods=['POST'])
def feature_ranking():
    data = request.json
    session_id = data.get("session_id")
    feature_rankings = data.get("feature_rankings", [])

    if not session_id or not feature_rankings:
        return jsonify({"error": "session_id and feature_rankings are required"}), 400

    try:
        with engine.begin() as connection:
            insert_query = text('''
                INSERT INTO FeatureRankings (session_id, rank_position, feature_name)
                VALUES (:session_id, :rank_position, :feature_name)
            ''')
            for fr in feature_rankings:
                rank_position = fr.get("rank_position")
                feature_name = fr.get("feature_name")
                if rank_position is not None and feature_name:
                    connection.execute(insert_query, {
                        'session_id': session_id,
                        'rank_position': rank_position,
                        'feature_name': feature_name
                    })

        return jsonify({"message": "Feature rankings saved successfully!"}), 200
    except Exception as e:
        print("Error recording feature ranking:", str(e))
        return jsonify({"error": "Could not record feature ranking"}), 500


# ----------------------------- MY SESSIONS -----------------------------
@app.route('/mySessions', methods=['GET'])
def my_sessions():
    """
    Returns a list of session IDs + session_name for the user’s email.
    """
    email = request.args.get("email")
    if not email:
        return jsonify({"error": "Missing email parameter"}), 400

    try:
        with engine.connect() as conn:
            query = text("""
                SELECT session_id, session_name, MIN(event_timestamp) as session_created
                FROM Connections
                WHERE email = :email
                  AND session_id IS NOT NULL
                  AND event_type = 'session_created'
                  AND (is_deleted = 0)
                GROUP BY session_id, session_name
                ORDER BY MIN(event_timestamp) DESC
            """)
            rows = conn.execute(query, {"email": email}).fetchall()

        sessions = []
        for row in rows:
            the_name = row.session_name if row.session_name else row.session_id
            sessions.append({
                "session_id": row.session_id,
                "session_name": the_name,
                "created_at": str(row.session_created) if row.session_created else None
            })

        return jsonify(sessions), 200
    except Exception as e:
        print("Error in /mySessions:", e)
        return jsonify({"error": "Could not retrieve sessions"}), 500


# ----------------------------- DELETE SESSION -----------------------------
@app.route('/deleteSession/<session_id>', methods=['POST'])
def delete_session(session_id):
    """
    Soft-delete a session by setting is_deleted=1 in Connections.
    """
    data = request.json or {}
    email = data.get("email")  # optional if you want to verify ownership
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    try:
        with engine.begin() as conn:
            up_query = text("""
                UPDATE Connections
                SET is_deleted = 1
                WHERE session_id = :sid
                  AND event_type = 'session_created'
            """)
            conn.execute(up_query, {'sid': session_id})

        return jsonify({"message": "Session soft-deleted."}), 200
    except Exception as e:
        print("Error in deleteSession:", e)
        return jsonify({"error": "Could not delete session"}), 500


# ----------------------------- LOAD SESSION DATA -----------------------------
@app.route('/sessionData/<session_id>', methods=['GET'])
def get_session_data(session_id):
    """
    Returns all the user’s Q&A, recommendation, follow-ups,
    AND feature rankings for a given session_id.
    """
    try:
        with engine.connect() as conn:
            # 1) Pull Q&As (from responses + new_questions3)
            qa_rows = conn.execute(text("""
                SELECT q.question, r.response_text, r.question_id
                FROM responses r
                LEFT JOIN new_questions3 q ON r.question_id = q.id
                WHERE r.session_id = :session_id
                ORDER BY r.id ASC
            """), {"session_id": session_id}).fetchall()

            # 2) Final recommendation from LLMResponses
            llm_row = conn.execute(text("""
                SELECT response_text
                FROM LLMResponses
                WHERE session_id = :session_id
                ORDER BY id DESC
            """), {"session_id": session_id}).fetchone()
            recommendation = llm_row.response_text if llm_row else None

            # 3) Follow-ups from FollowUps table
            fup_rows = conn.execute(text("""
                SELECT user_message, assistant_message
                FROM FollowUps
                WHERE session_id = :session_id
                ORDER BY id ASC
            """), {"session_id": session_id}).fetchall()

            # 4) Feature Rankings
            fr_rows = conn.execute(text("""
                SELECT rank_position, feature_name
                FROM FeatureRankings
                WHERE session_id = :session_id
                ORDER BY rank_position
            """), {"session_id": session_id}).fetchall()

        # Build JSON response
        session_data = {
            "qa": [],
            "recommendation": recommendation,
            "followups": [],
            "feature_rankings": []
        }

        # Populate Q&A
        for row in qa_rows:
            if row.question_id == -1:
                # Free-form question
                session_data["qa"].append({
                    "question": "Free-form question",
                    "answer": row.response_text
                })
            else:
                q_text = row.question if row.question else "Question"
                session_data["qa"].append({
                    "question": q_text,
                    "answer": row.response_text
                })

        # Populate follow-ups
        for f in fup_rows:
            session_data["followups"].append({
                "user_message": f.user_message,
                "assistant_message": f.assistant_message
            })

        # Populate feature rankings
        for fr in fr_rows:
            session_data["feature_rankings"].append({
                "rank_position": fr.rank_position,
                "feature_name": fr.feature_name
            })

        return jsonify(session_data), 200
    except Exception as e:
        print("Error in /sessionData:", e)
        return jsonify({"error": "Could not retrieve session data"}), 500

# ----------------------------- GET HELP -----------------------------
@app.route('/getHelp', methods=['POST'])
def get_help():
    """
    Records a help request in the Get_Help table for a given session_id.
    """
    data = request.json
    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    try:
        with engine.begin() as connection:
            # Insert a row. 
            # The table might have columns: (id PK, session_id, timestamp default GETDATE(), etc.)
            insert_query = text("""
                INSERT INTO Get_Help (session_id, timestamp)
                VALUES (:session_id, GETDATE())
            """)
            connection.execute(insert_query, {"session_id": session_id})

        return jsonify({"message": "Help request recorded successfully!"}), 200

    except Exception as e:
        print("Error in /getHelp:", e)
        return jsonify({"error": "Could not record help request"}), 500

# ----------------------------- MAIN ----------------------------- 
if __name__ == '__main__':
    # Adjust the port or host as needed
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5001)))