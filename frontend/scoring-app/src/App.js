import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Container,
  LinearProgress,
  FormControl,
  Select,
  MenuItem,
  TextField,
  Typography,
  CircularProgress,
  CssBaseline,
  IconButton,
  createTheme,
  ThemeProvider,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link as MuiLink,
  Autocomplete,
  Chip,
} from "@mui/material";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";

// ICONS
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import DeleteIcon from "@mui/icons-material/Delete";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import ThumbDownAltIcon from "@mui/icons-material/ThumbDownAlt";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";

import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import jsPDF from "jspdf";
import "jspdf-autotable";

// ------------------ Utility Functions ------------------
const addWrappedText = (doc, text, x, y, options = {}) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = y;
  const lineHeight = options.lineHeight || 10;
  const maxWidth = options.maxWidth || doc.internal.pageSize.getWidth() - x * 2;
  const bottomMargin = options.bottomMargin || 20;
  const lines = doc.splitTextToSize(String(text), maxWidth);

  for (const lineText of lines) {
    if (currentY + lineHeight > pageHeight - bottomMargin) {
      doc.addPage();
      currentY = 20;
    }
    doc.text(lineText, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
};

const reorderList = (list, startIndex, endIndex) => {
  const newList = Array.from(list);
  const [removed] = newList.splice(startIndex, 1);
  newList.splice(endIndex, 0, removed);
  return newList;
};

// ------------------ Dark Theme ------------------
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#343541",
      paper: "#40414F",
    },
    primary: {
      main: "#10A37F",
    },
    secondary: {
      main: "#19C58D",
    },
    error: {
      main: "#F44336",
    },
    info: {
      main: "#0288d1", // default MUI 'info' color
    },
    text: {
      primary: "#ECECF1",
      secondary: "#AAAAAA",
    },
  },
  typography: {
    fontFamily: ["Segoe UI", "Helvetica Neue", "Arial", "sans-serif"].join(","),
    body1: {
      color: "#ECECF1",
    },
  },
});

// ------------------ Custom Link Renderer for Markdown ------------------
const LinkRenderer = ({ href, children }) => (
  <MuiLink
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    underline="hover"
    sx={{ color: "#19C58D", fontWeight: 500 }}
  >
    {children}
  </MuiLink>
);

// ------------------ Markdown Renderer ------------------
const MarkdownRenderer = ({ content }) => {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: LinkRenderer }}>
      {content}
    </ReactMarkdown>
  );
};

function App() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [userEmail, setUserEmail] = useState(null);

  // Sessions & Active Session
  const [mySessions, setMySessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSessionData, setActiveSessionData] = useState(null);

  // Q&A from DB
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [questionsByCategory, setQuestionsByCategory] = useState({});
  const [responses, setResponses] = useState({});

  // MUI Autocomplete states for #4, #5, #6, #7, #10
  const [scenarios, setScenarios] = useState([]);            
  const [retrievalTechniques, setRetrievalTechniques] = useState([]); 
  const [kbDataTypes, setKbDataTypes] = useState([]);        
  const [kbDataSources, setKbDataSources] = useState([]);    
  const [appDataSources, setAppDataSources] = useState([]);  

  // Free-form
  const [freeFormResponse, setFreeFormResponse] = useState("");

  // Feature Ranking
  const [showFeatureRanking, setShowFeatureRanking] = useState(false);
  const [availableFeatures, setAvailableFeatures] = useState([
    ">99.99% SLA",
    "Geospatial",
    "Real-time / Streaming Ingest",
    "Multi-region availability",
    "Analytics",
    "Integration with Data Analytics / MLOps",
    "Fine-grained Security & Governance (RLS/CLS)",
    "Autoscale",
    "Data Versioning & History",
    "Low-latency Reads",
    "Built-in Data Chunking & Vectorization",
  ]);
  const [top5Features, setTop5Features] = useState([]);

  // Final
  const [recommendation, setRecommendation] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [feedback, setFeedback] = useState("");

  // Steps
  const [showQuestions, setShowQuestions] = useState(false);
  const [hasEnteredFreeForm, setHasEnteredFreeForm] = useState(false);

  // Follow-ups
  const [followUpCount, setFollowUpCount] = useState(0);
  const [conversation, setConversation] = useState([]);
  const [followupQuestion, setFollowupQuestion] = useState("");

  // Loading
  const [isLoading, setIsLoading] = useState(false);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);

  // Quick feedback messages
  const [tempFeedbackMessage, setTempFeedbackMessage] = useState("");
  const [tempHelpMessage, setTempHelpMessage] = useState(""); // For "Contact Data Team"

  // Thumbs Down
  const [thumbsDownOpen, setThumbsDownOpen] = useState(false);
  const [thumbsDownComments, setThumbsDownComments] = useState("");

  // Current Category
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);

  // Backend
  const API_BASE_URL =
    process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:5001";


  // ------------------ Effects ------------------
  const fetchQuestions = useCallback(() => {
    fetch(`${API_BASE_URL}/questions`)
      .then((resp) => resp.json())
      .then((data) => {
        const formatted = data.map((q) => ({
          id: q.id,
          category: q.Category,
          question_text: q.Question,
          options: q.options ? q.options.split("|") : [],
        }));
        setQuestions(formatted);

        const catMap = {};
        formatted.forEach((q) => {
          if (!catMap[q.category]) catMap[q.category] = [];
          catMap[q.category].push(q);
        });
        setCategories(Object.keys(catMap));
        setQuestionsByCategory(catMap);
      })
      .catch(console.error);
  }, [API_BASE_URL]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchQuestions();
    }
  }, [isAuthenticated, fetchQuestions]);

  // Record login
  useEffect(() => {
    if (isAuthenticated) {
      const acct = instance.getActiveAccount();
      if (acct) {
        const email = acct.username;
        setUserEmail(email);

        fetch(`${API_BASE_URL}/recordLogin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(console.error);
      }
    }
  }, [isAuthenticated, instance, API_BASE_URL]);

  // Fetch sessions for user
  const fetchSessionsForUser = useCallback(async () => {
    if (!userEmail) return;
    try {
      const resp = await fetch(
        `${API_BASE_URL}/mySessions?email=${encodeURIComponent(userEmail)}`
      );
      if (!resp.ok) throw new Error("Failed to fetch my sessions");
      const data = await resp.json();
      setMySessions(data);
    } catch (err) {
      console.error("Error fetching my sessions:", err);
    }
  }, [API_BASE_URL, userEmail]);

  useEffect(() => {
    if (isAuthenticated && userEmail) {
      fetchSessionsForUser();
    }
  }, [isAuthenticated, userEmail, fetchSessionsForUser]);

  // Clear ephemeral messages after 3s
  useEffect(() => {
    if (tempFeedbackMessage) {
      const t = setTimeout(() => setTempFeedbackMessage(""), 3000);
      return () => clearTimeout(t);
    }
  }, [tempFeedbackMessage]);

  useEffect(() => {
    if (tempHelpMessage) {
      const timer = setTimeout(() => setTempHelpMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [tempHelpMessage]);

  // ------------------ SUBMIT ------------------
  const handleSubmit = async (optionalTop5Features = []) => {
    setIsLoading(true);
    setFollowUpCount(0);
    setConversation([]);

    // Build question payload
    const payload = questions.map((q) => {
      let answerValue = responses[q.id] || "";

      // If q.id is in [4,5,6,7,10], set from local states
      if (q.id === 4) {
        answerValue = scenarios.join(", ");
      } else if (q.id === 5) {
        answerValue = retrievalTechniques.join(", ");
      } else if (q.id === 6) {
        answerValue = kbDataTypes.join(", ");
      } else if (q.id === 7) {
        answerValue = kbDataSources.join(", ");
      } else if (q.id === 10) {
        answerValue = appDataSources.join(", ");
      } else if (typeof responses[q.id] === "string") {
        // fallback
        answerValue = responses[q.id];
      }

      return {
        question_id: q.id,
        question: q.question_text,
        answer: answerValue,
      };
    });

    // Add free-form
    payload.push({
      question_id: -1,
      question: "Free-form question",
      answer: freeFormResponse,
    });

    try {
      // Submit => new session
      const submitResp = await fetch(`${API_BASE_URL}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!submitResp.ok) throw new Error("Failed to submit data");
      const data = await submitResp.json();

      setSessionId(data.session_id);
      setSessionName(data.session_name || "");
      console.log(sessionName); // keep

      // record session
      if (userEmail && data.session_id) {
        fetch(`${API_BASE_URL}/recordSession`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userEmail,
            session_id: data.session_id,
            session_name: data.session_name,
          }),
        }).catch(console.error);
      }

      // If top5 => featureRanking
      if (optionalTop5Features.length > 0) {
        const fr = optionalTop5Features.map((feat, idx) => ({
          rank_position: idx + 1,
          feature_name: feat,
        }));
        const frResp = await fetch(`${API_BASE_URL}/featureRanking`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: data.session_id,
            feature_rankings: fr,
          }),
        });
        if (!frResp.ok) {
          const eD = await frResp.json();
          alert(`Failed to record feature ranking: ${eD.error}`);
        }
      }

      // Get final recommendation
      const recResp = await fetch(`${API_BASE_URL}/recommendation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: payload,
          session_id: data.session_id,
          top5_features: optionalTop5Features,
        }),
      });
      if (!recResp.ok) throw new Error("Fetching recommendation failed");
      const recData = await recResp.json();
      setRecommendation(recData.recommendation);

      // Refresh sessions
      await fetchSessionsForUser();
    } catch (err) {
      console.error("Error in handleSubmit:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete session
  const handleDeleteSession = async (sId) => {
    const confirmDel = window.confirm("Are you sure you want to delete this session?");
    if (!confirmDel) return;

    try {
      const resp = await fetch(`${API_BASE_URL}/deleteSession/${sId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      if (!resp.ok) throw new Error("Delete session failed");

      if (activeSessionId === sId) {
        setActiveSessionId("");
        setActiveSessionData(null);
      }
      await fetchSessionsForUser();
    } catch (err) {
      console.error("Error deleting session:", err);
      alert("Could not delete session.");
    }
  };

  // Export PDF
  function handleExportPDF() {
    if (!activeSessionData) return;

    const doc = new jsPDF();
    const pdfFileName = activeSessionData.session_name
      ? `${activeSessionData.session_name}.pdf`
      : `Project_${activeSessionId}.pdf`;

    doc.setFontSize(14);
    doc.text(`Project: ${activeSessionData.session_name || activeSessionId}`, 20, 30);

    let yPos = 60;

    if (activeSessionData.recommendation) {
      doc.setFontSize(12);
      doc.text("Recommendation:", 20, yPos);
      yPos += 14;
      yPos = addWrappedText(doc, activeSessionData.recommendation, 20, yPos, {
        lineHeight: 10,
        maxWidth: 170,
      });
      yPos += 10;
    }

    if (activeSessionData.qa && activeSessionData.qa.length > 0) {
      doc.setFontSize(12);
      doc.text("Q&A:", 20, yPos);
      yPos += 10;

      const tableBody = activeSessionData.qa.map((item) => [item.question, item.answer]);

      doc.autoTable({
        startY: yPos,
        head: [["Question", "Answer"]],
        body: tableBody,
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      });
      yPos = doc.autoTable.previous.finalY + 20;
    }

    if (activeSessionData.followups && activeSessionData.followups.length > 0) {
      doc.setFontSize(12);
      doc.text("Follow-up Conversation:", 20, yPos);
      yPos += 14;

      activeSessionData.followups.forEach((f) => {
        const userText = `You: ${f.user_message}`;
        yPos = addWrappedText(doc, userText, 20, yPos, { lineHeight: 10, maxWidth: 170 });
        yPos += 10;

        const assistantText = `Assistant: ${f.assistant_message}`;
        yPos = addWrappedText(doc, assistantText, 20, yPos, { lineHeight: 10, maxWidth: 170 });
        yPos += 20;
      });
    }

    doc.save(pdfFileName);
  }

  // Decide if each category should show
  const shouldShowCategory = (cat) => {
    if (cat === "Knowledge Base") {
      return scenarios.includes("Knowledge Base");
    }
    if (cat === "Operational Data") {
      return scenarios.includes("Operational Data running the core application");
    }
    return true;
  };
  const filteredCategories = categories.filter((cat) => shouldShowCategory(cat));

  // Category nav
  const handleNextCategory = () => {
    if (currentCategoryIndex + 1 >= filteredCategories.length) {
      setShowQuestions(false);
      setShowFeatureRanking(true);
    } else {
      setCurrentCategoryIndex((prev) => prev + 1);
    }
  };
  const handlePrevCategory = () => {
    if (currentCategoryIndex > 0) {
      setCurrentCategoryIndex((prev) => prev - 1);
    } else {
      setShowQuestions(false);
      setHasEnteredFreeForm(false);
    }
  };

  // Steps
  const handleSkipFreeForm = () => {
    setHasEnteredFreeForm(true);
    handleSubmit();
  };
  const handleGoToQuestions = () => {
    setHasEnteredFreeForm(true);
    setShowQuestions(true);
  };

  // Feedback
  const handleThumbsUp = async () => {
    setFeedback("thumbs_up");
    console.log(feedback); // keep
    if (!sessionId) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, feedback: "thumbs_up" }),
      });
      if (!resp.ok) throw new Error("Failed to submit thumbs up");
      setTempFeedbackMessage("Thanks for your feedback!");
    } catch (err) {
      console.error("Error submitting feedback:", err);
    }
  };
  const handleThumbsDownClick = () => {
    setThumbsDownOpen(true);
    setFeedback("thumbs_down");
  };
  const handleThumbsDownClose = () => {
    setThumbsDownOpen(false);
    setThumbsDownComments("");
  };
  const handleThumbsDownSubmit = async () => {
    if (!sessionId) {
      setThumbsDownOpen(false);
      return;
    }
    try {
      const resp = await fetch(`${API_BASE_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          feedback: "thumbs_down",
          comments: thumbsDownComments,
        }),
      });
      if (!resp.ok) throw new Error("Failed to submit thumbs down");
      setTempFeedbackMessage("Thanks for letting us know!");
      setThumbsDownOpen(false);
      setThumbsDownComments("");
    } catch (err) {
      console.error("Error with thumbs down feedback:", err);
    }
  };

  // "Contact Data Team"
  const handleGetHelp = async () => {
    if (!sessionId) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/getHelp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!resp.ok) {
        const errData = await resp.json();
        alert("Could not record help request: " + errData.error);
        return;
      }
      setTempHelpMessage("We will contact you in the next business day.");
    } catch (err) {
      console.error("Error calling /getHelp:", err);
    }
  };

  // Follow-ups
  const handleFollowupSubmit = async () => {
    if (followUpCount >= 20 || !followupQuestion.trim()) return;
    setIsFollowUpLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: followupQuestion }),
      });
      if (!resp.ok) {
        const errD = await resp.json();
        alert(errD.error);
        return;
      }
      const data = await resp.json();
      setConversation((prev) => [
        ...prev,
        { role: "user", content: followupQuestion },
        { role: "assistant", content: data.answer },
      ]);
      setFollowUpCount((prev) => prev + 1);
      setFollowupQuestion("");
    } catch (err) {
      console.error("Follow-up error:", err);
    } finally {
      setIsFollowUpLoading(false);
    }
  };
  const handleFollowupSend = async () => {
    if (!followupQuestion.trim()) return;
    setIsFollowUpLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message: followupQuestion,
        }),
      });
      if (!resp.ok) throw new Error("Follow-up failed");
      const data = await resp.json();
      const newFup = {
        user_message: followupQuestion,
        assistant_message: data.answer,
      };
      setActiveSessionData((prev) => ({
        ...prev,
        followups: [...(prev?.followups || []), newFup],
      }));
      setFollowupQuestion("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsFollowUpLoading(false);
    }
  };

  // Edit or restart
  const handleGoBackToInput = () => {
    setRecommendation("");
    setSessionId("");
    setSessionName("");
    setIsLoading(false);
    setFollowUpCount(0);
    setConversation([]);
    setFollowupQuestion("");
    setIsFollowUpLoading(false);
    setShowQuestions(false);
    setHasEnteredFreeForm(false);
    setShowFeatureRanking(false);
    setCurrentCategoryIndex(0);
  };
  const handleRestart = () => {
    setQuestions([]);
    setCategories([]);
    setQuestionsByCategory({});
    setResponses({});
    setRecommendation("");
    setSessionId("");
    setSessionName("");
    setFeedback("");
    setFreeFormResponse("");
    setIsLoading(false);
    setFollowUpCount(0);
    setConversation([]);
    setFollowupQuestion("");
    setIsFollowUpLoading(false);
    setCurrentCategoryIndex(0);
    setShowQuestions(false);
    setHasEnteredFreeForm(false);
    setShowFeatureRanking(false);

    // Clear multi states
    setScenarios([]);
    setRetrievalTechniques([]);
    setKbDataTypes([]);
    setKbDataSources([]);
    setAppDataSources([]);

    setAvailableFeatures([
      ">99.99% SLA",
      "Geospatial",
      "Real-time / Streaming Ingest",
      "Multi-region availability on reads and writes",
      "Analytics",
      "Integration with Data Analytics / MLOps",
      "Fine-grained Security & Governance (RLS/CLS)",
      "Autoscale",
      "Data Versioning & History",
      "Low-latency Reads",
      "Built-in Data Chunking & Vectorization",
    ]);
    setTop5Features([]);

    if (isAuthenticated) {
      fetchQuestions();
      fetchSessionsForUser();
    }
  };

  // Drag & drop for feature ranking
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    if (source.droppableId === "top5") {
      setTop5Features(reorderList(top5Features, source.index, destination.index));
    } else if (source.droppableId === "available") {
      setAvailableFeatures(reorderList(availableFeatures, source.index, destination.index));
    }

    if (source.droppableId === "available" && destination.droppableId === "top5") {
      if (top5Features.length >= 5) return;
      const newAvailable = [...availableFeatures];
      const [removed] = newAvailable.splice(source.index, 1);
      const newTop5 = [...top5Features];
      newTop5.splice(destination.index, 0, removed);
      setAvailableFeatures(newAvailable);
      setTop5Features(newTop5);
    } else if (source.droppableId === "top5" && destination.droppableId === "available") {
      const newTop5 = [...top5Features];
      const [removed] = newTop5.splice(source.index, 1);
      const newAvailable = [...availableFeatures];
      newAvailable.splice(destination.index, 0, removed);
      setTop5Features(newTop5);
      setAvailableFeatures(newAvailable);
    }
  };

  // Auth
  const handleLogin = async () => {
    try {
      const result = await instance.loginPopup();
      instance.setActiveAccount(result.account);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };
  const handleLogout = async () => {
    if (userEmail) {
      await fetch(`${API_BASE_URL}/recordLogout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      }).catch(console.error);
    }
    await instance.logoutPopup();
  };

  // Session selection
  const handleSelectSession = async (sId) => {
    try {
      setActiveSessionId(sId);
      const resp = await fetch(`${API_BASE_URL}/sessionData/${sId}`);
      if (!resp.ok) throw new Error("Failed to fetch session data");
      const data = await resp.json();
      setActiveSessionData(data);
      setSessionId(sId);
    } catch (err) {
      console.error("Error loading session:", err);
    }
  };
  const handleStartNewSession = () => {
    setActiveSessionId("");
    setActiveSessionData(null);
    handleRestart();
  };

  // Progress
  let totalSteps = showQuestions ? filteredCategories.length : 1;
  let currentProgress = showQuestions
    ? currentCategoryIndex
    : hasEnteredFreeForm
    ? totalSteps
    : 0;
  const progress = (currentProgress / totalSteps) * 100;

  const currentCategory = filteredCategories[currentCategoryIndex];
  const currentCategoryQuestions = currentCategory
    ? questionsByCategory[currentCategory]
    : [];

  // ------------------ RENDER ------------------
  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Container maxWidth="md">
          <Typography variant="h4" align="center" sx={{ mt: 5 }}>
            Please Sign In
          </Typography>
          <Box textAlign="center" mt={3}>
            <Button variant="contained" onClick={handleLogin}>
              Sign In with Entra ID
            </Button>
          </Box>
        </Container>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box display="flex" minHeight="100vh">
        {/* LEFT SIDEBAR */}
        <Box
          sx={{
            width: 250,
            backgroundColor: "#40414F",
            p: 2,
            borderRight: "1px solid #222",
          }}
        >
          <Typography variant="h6" gutterBottom>
            My Projects
          </Typography>
          <Button
            variant="contained"
            size="small"
            sx={{ mb: 2 }}
            onClick={handleStartNewSession}
          >
            + Start New Project
          </Button>

          {mySessions && Array.isArray(mySessions) && mySessions.length > 0 ? (
            mySessions.map((session) => (
              <Box
                key={session.session_id}
                sx={{
                  mb: 1,
                  p: 1,
                  borderRadius: 1,
                  display: "flex",
                  alignItems: "center",
                  backgroundColor:
                    activeSessionId === session.session_id ? "#333" : "transparent",
                  "&:hover": { backgroundColor: "#555" },
                  cursor: "pointer",
                }}
              >
                <Box
                  onClick={() => handleSelectSession(session.session_id)}
                  sx={{ flex: 1 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                    {session.session_name || session.session_id}
                  </Typography>
                </Box>
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(session.session_id);
                  }}
                  sx={{
                    color: "#bbb",
                    "&:hover": {
                      color: "red",
                    },
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))
          ) : (
            <Typography variant="body2" sx={{ mt: 1 }}>
              No sessions found.
            </Typography>
          )}
        </Box>

        {/* MAIN CONTENT */}
        <Box flex={1} p={2} bgcolor="background.default">
          <Box display="flex" justifyContent="flex-end" mb={1}>
            <IconButton onClick={handleLogout} title="Logout" sx={{ color: "#ccc" }}>
              <ExitToAppIcon />
            </IconButton>
          </Box>

          {activeSessionId && activeSessionData ? (
            <Box>
              {/* Viewing a session */}
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h5">
                  Viewing Project: {activeSessionData.session_name || activeSessionId}
                </Typography>

                {/* Export + Help */}
                <Box>
                  <Box display="flex" gap={2}>
                    <Button
                      variant="contained"
                      color="secondary"
                      startIcon={<PictureAsPdfIcon />}
                      onClick={handleExportPDF}
                    >
                      Export
                    </Button>

                    <Button
                      variant="contained"
                      color="info"
                      startIcon={<HelpOutlineIcon />}
                      onClick={handleGetHelp}
                    >
                      Contact Data Team
                    </Button>
                  </Box>

                  {/* Show ephemeral message right below */}
                  {tempHelpMessage && (
                    <Box mt={1}>
                      <Typography variant="body2" sx={{ color: "info.main" }}>
                        {tempHelpMessage}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Q&A */}
              {activeSessionData.qa && activeSessionData.qa.length > 0 && (
                <Box mt={2}>
                  <Typography variant="h6">Initial Q&A:</Typography>
                  {activeSessionData.qa.map((item, idx) => (
                    <Box
                      key={idx}
                      mt={2}
                      p={2}
                      borderRadius={2}
                      sx={{ backgroundColor: "#2A2B32" }}
                    >
                      <Typography variant="subtitle2" sx={{ color: "#19C58D" }}>
                        <strong>Question:</strong> {item.question}
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 1 }}>
                        <strong>Answer:</strong> {item.answer}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Feature Rankings */}
              {activeSessionData.feature_rankings &&
                activeSessionData.feature_rankings.length > 0 && (
                  <Box mt={2}>
                    <Typography variant="h6">Feature Rankings:</Typography>
                    <Box ml={2}>
                      {activeSessionData.feature_rankings.map((fr, idx) => (
                        <Typography key={idx} variant="body2">
                          {fr.rank_position}. {fr.feature_name}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                )}

              {/* Recommendation */}
              {activeSessionData.recommendation && (
                <Box mt={2} p={2} bgcolor="#444654" borderRadius={2}>
                  <MarkdownRenderer content={activeSessionData.recommendation} />
                </Box>
              )}

              {/* Follow-ups */}
              {activeSessionData.followups && activeSessionData.followups.length > 0 && (
                <Box mt={2}>
                  <Typography variant="h6">Follow-up Conversation:</Typography>
                  {activeSessionData.followups.map((f, idx) => (
                    <Box key={idx} mt={1}>
                      <Box textAlign="right" mb={1}>
                        <Box
                          display="inline-block"
                          bgcolor="#10A37F"
                          color="#fff"
                          p={1}
                          borderRadius={2}
                        >
                          <strong>You:</strong> {f.user_message}
                        </Box>
                      </Box>
                      <Box textAlign="left" mb={2}>
                        <Box display="inline-block" bgcolor="#444654" p={1} borderRadius={2}>
                          <strong>Assistant:</strong>{" "}
                          <MarkdownRenderer content={f.assistant_message} />
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Ask new follow-up */}
              <Box mt={4}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Ask a new follow-up question:
                </Typography>
                <TextField
                  fullWidth
                  variant="outlined"
                  value={followupQuestion}
                  onChange={(e) => setFollowupQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleFollowupSend();
                    }
                  }}
                  margin="normal"
                  disabled={isFollowUpLoading}
                  sx={{ bgcolor: "background.paper" }}
                />
                <Box display="flex" gap={2} alignItems="center" mt={1}>
                  {isFollowUpLoading ? (
                    <Box display="flex" alignItems="center" gap={1}>
                      <CircularProgress size={24} />
                      <Typography variant="body2">Processing follow-up...</Typography>
                    </Box>
                  ) : (
                    <>
                      <Button variant="contained" color="primary" onClick={handleFollowupSend}>
                        Send
                      </Button>
                      {/* You can add a second "Contact Data Team" below if desired */}
                    </>
                  )}
                </Box>
              </Box>
            </Box>
          ) : (
            // If not viewing a session => wizard flow
            <Box>
              {/* STEP 1: FREE FORM */}
              {recommendation === "" &&
                !hasEnteredFreeForm &&
                !isLoading &&
                !showQuestions &&
                !showFeatureRanking && (
                  <Container maxWidth="md">
                    <Box
                      sx={{
                        textAlign: "center",
                        backgroundColor: "background.paper",
                        p: 3,
                        borderRadius: 2,
                        boxShadow: "0px 4px 6px rgba(0,0,0,0.2)",
                        mb: 4,
                      }}
                    >
                      <Typography
                        variant="h3"
                        sx={{
                          fontWeight: "bold",
                          background: "linear-gradient(90deg, #10A37F, #19C58D)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                        }}
                      >
                        Data Advisor for Intelligent Applications
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 2, textAlign: "left" }}>
                        To get the best recommendation, follow these three steps:
                        <ul
                          style={{
                            textAlign: "left",
                            margin: "10px 0",
                            paddingLeft: "20px",
                          }}
                        >
                          <li>
                            <strong>Free Form:</strong> Provide details about the workload.
                          </li>
                          <li>
                            <strong>Questions:</strong> Answer targeted questions.
                          </li>
                          <li>
                            <strong>Areas of Importance:</strong> Rank the top 5 features.
                          </li>
                        </ul>
                        Each step is optional, but the more details you provide, the better!
                      </Typography>
                    </Box>

                    <TextField
                      fullWidth
                      multiline
                      rows={5}
                      placeholder={`Enter details about the workload, e.g.:
                        *) Goals & expansions
                        *) Current challenges
                        *) Data sources used / Dev Framework (e.g, .Net,Python)
                        *) Customer data strategy (e.g, modernization, migration)
                        (The more detail, the better) SHIFT+Enter for newline, ENTER to submit`}
                      value={freeFormResponse}
                      onChange={(e) => setFreeFormResponse(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleGoToQuestions();
                        }
                      }}
                      margin="normal"
                      sx={{ bgcolor: "background.paper" }}
                    />

                    <Box mt={2} display="flex" justifyContent="space-between">
                      <Button variant="contained" color="secondary" onClick={handleSkipFreeForm}>
                        Skip and Get Recommendation
                      </Button>
                      <Button variant="contained" color="primary" onClick={handleGoToQuestions}>
                        Continue to Questions
                      </Button>
                    </Box>
                  </Container>
                )}

              {/* STEP 2: Q&A */}
              {recommendation === "" && showQuestions && (
                <>
                  <LinearProgress variant="determinate" value={progress} />
                  <Typography align="center" mt={2}>
                    {Math.round(progress)}% Complete
                  </Typography>
                </>
              )}
              {recommendation === "" && !isLoading && showQuestions && currentCategory && (
                <Container maxWidth="md">
                  <Box mt={4}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      Category: {currentCategory}
                    </Typography>

                    {currentCategoryQuestions.map((q) => (
                      <Box
                        key={q.id}
                        mt={2}
                        p={2}
                        borderRadius={2}
                        sx={{ backgroundColor: "#2A2B32" }}
                      >
                        <Typography
                          variant="subtitle1"
                          sx={{ color: "#19C58D", fontWeight: "bold", mb: 1 }}
                        >
                          {q.question_text}
                        </Typography>

                        {(() => {
                          if (q.id === 4) {
                            return (
                              <Autocomplete
                                multiple
                                freeSolo
                                options={q.options}
                                value={scenarios}
                                onChange={(event, newValue) => setScenarios(newValue)}
                                renderTags={(value, getTagProps) =>
                                  value.map((option, index) => (
                                    <Chip
                                      variant="outlined"
                                      label={option}
                                      {...getTagProps({ index })}
                                    />
                                  ))
                                }
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    variant="outlined"
                                    placeholder="Add or enter custom scenarios"
                                    sx={{ bgcolor: "background.paper" }}
                                  />
                                )}
                              />
                            );
                          } else if (q.id === 5) {
                            return (
                              <Autocomplete
                                multiple
                                freeSolo
                                options={q.options}
                                value={retrievalTechniques}
                                onChange={(event, newValue) =>
                                  setRetrievalTechniques(newValue)
                                }
                                renderTags={(value, getTagProps) =>
                                  value.map((option, index) => (
                                    <Chip
                                      variant="outlined"
                                      label={option}
                                      {...getTagProps({ index })}
                                    />
                                  ))
                                }
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    variant="outlined"
                                    placeholder="Add retrieval techniques"
                                    sx={{ bgcolor: "background.paper" }}
                                  />
                                )}
                              />
                            );
                          } else if (q.id === 6) {
                            return (
                              <Autocomplete
                                multiple
                                freeSolo
                                options={q.options}
                                value={kbDataTypes}
                                onChange={(event, newValue) => setKbDataTypes(newValue)}
                                renderTags={(value, getTagProps) =>
                                  value.map((option, index) => (
                                    <Chip
                                      variant="outlined"
                                      label={option}
                                      {...getTagProps({ index })}
                                    />
                                  ))
                                }
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    variant="outlined"
                                    placeholder="Add data types"
                                    sx={{ bgcolor: "background.paper" }}
                                  />
                                )}
                              />
                            );
                          } else if (q.id === 7) {
                            return (
                              <Autocomplete
                                multiple
                                freeSolo
                                options={q.options}
                                value={kbDataSources}
                                onChange={(event, newValue) => setKbDataSources(newValue)}
                                renderTags={(value, getTagProps) =>
                                  value.map((option, index) => (
                                    <Chip
                                      variant="outlined"
                                      label={option}
                                      {...getTagProps({ index })}
                                    />
                                  ))
                                }
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    variant="outlined"
                                    placeholder="Add data sources for your KB"
                                    sx={{ bgcolor: "background.paper" }}
                                  />
                                )}
                              />
                            );
                          } else if (q.id === 10) {
                            return (
                              <Autocomplete
                                multiple
                                freeSolo
                                options={q.options}
                                value={appDataSources}
                                onChange={(event, newValue) => setAppDataSources(newValue)}
                                renderTags={(value, getTagProps) =>
                                  value.map((option, index) => (
                                    <Chip
                                      variant="outlined"
                                      label={option}
                                      {...getTagProps({ index })}
                                    />
                                  ))
                                }
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    variant="outlined"
                                    placeholder="Add data sources for core app"
                                    sx={{ bgcolor: "background.paper" }}
                                  />
                                )}
                              />
                            );
                          }

                          // Otherwise fallback
                          if (q.options && q.options.length > 1) {
                            // single select
                            return (
                              <FormControl fullWidth margin="normal">
                                <Select
                                  value={responses[q.id] || ""}
                                  onChange={(e) =>
                                    setResponses((prev) => ({
                                      ...prev,
                                      [q.id]: e.target.value,
                                    }))
                                  }
                                  displayEmpty
                                  sx={{ bgcolor: "background.paper" }}
                                >
                                  <MenuItem value="">
                                    <em>Not Applicable</em>
                                  </MenuItem>
                                  {q.options.map((option, idx) => (
                                    <MenuItem key={idx} value={option}>
                                      {option}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            );
                          }

                          // fallback text
                          return (
                            <TextField
                              fullWidth
                              variant="outlined"
                              value={responses[q.id] || ""}
                              onChange={(e) =>
                                setResponses((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              placeholder="Leave blank if not applicable"
                              sx={{ bgcolor: "background.paper" }}
                            />
                          );
                        })()}
                      </Box>
                    ))}

                    <Box display="flex" alignItems="center" mt={4}>
                      <Button variant="outlined" onClick={handlePrevCategory}>
                        Back
                      </Button>
                      <Button
                        variant="contained"
                        color="primary"
                        sx={{ ml: "auto" }}
                        onClick={handleNextCategory}
                      >
                        {currentCategoryIndex + 1 < filteredCategories.length
                          ? "Next"
                          : "Continue to Requirements"}
                      </Button>
                    </Box>
                  </Box>
                </Container>
              )}

              {/* STEP 3: Feature Ranking */}
              {recommendation === "" && !isLoading && showFeatureRanking && (
                <Container maxWidth="md" sx={{ mb: 8 }}>
                  <Box mt={4}>
                    <Typography variant="h5" gutterBottom>
                      Pick Top 5 Areas of Requirements
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Drag and drop features to order by importance (up to 5).
                    </Typography>
                    <DragDropContext onDragEnd={onDragEnd}>
                      <Box display="flex" gap={4} mt={2}>
                        <Droppable droppableId="available">
                          {(provided) => (
                            <Box
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              sx={{
                                flex: 1,
                                border: "1px solid #555",
                                minHeight: "300px",
                                borderRadius: 2,
                                p: 2,
                                backgroundColor: "#444654",
                              }}
                            >
                              <Typography variant="subtitle1" mb={1}>
                                Available Features
                              </Typography>
                              {availableFeatures.map((feat, index) => (
                                <Draggable key={feat} draggableId={feat} index={index}>
                                  {(dragProvided) => (
                                    <Box
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      sx={{
                                        mb: 1,
                                        p: 1,
                                        backgroundColor: "#343541",
                                        border: "1px solid #555",
                                        borderRadius: 1,
                                        cursor: "grab",
                                      }}
                                    >
                                      {feat}
                                    </Box>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </Box>
                          )}
                        </Droppable>
                        <Droppable droppableId="top5">
                          {(provided) => (
                            <Box
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              sx={{
                                flex: 1,
                                border: "1px solid #555",
                                minHeight: "300px",
                                borderRadius: 2,
                                p: 2,
                                backgroundColor: "#444654",
                              }}
                            >
                              <Typography variant="subtitle1" mb={1}>
                                Your Top 5 (in order)
                              </Typography>
                              {top5Features.map((feat, index) => (
                                <Draggable key={feat} draggableId={feat} index={index}>
                                  {(dragProvided) => (
                                    <Box
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      sx={{
                                        mb: 1,
                                        p: 1,
                                        backgroundColor: "#343541",
                                        border: "1px solid #555",
                                        borderRadius: 1,
                                        cursor: "grab",
                                      }}
                                    >
                                      <strong>{index + 1}.</strong> {feat}
                                    </Box>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </Box>
                          )}
                        </Droppable>
                      </Box>
                    </DragDropContext>

                    <Box mt={4} display="flex" justifyContent="space-between">
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setShowFeatureRanking(false);
                          setShowQuestions(true);
                        }}
                      >
                        Back to Questions
                      </Button>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={() => handleSubmit(top5Features)}
                      >
                        Finish &amp; Get Recommendation
                      </Button>
                    </Box>
                  </Box>
                </Container>
              )}

              {/* LOADING */}
              {isLoading && (
                <Box mt={4} textAlign="center">
                  <CircularProgress />
                  <Typography mt={2}>Processing responses...</Typography>
                </Box>
              )}

              {/* FINAL RECOMMENDATION & FEEDBACK BELOW (only if recommendation not empty) */}
              {recommendation && (
                <Container maxWidth="md">
                  <Box mt={4}>
                    <Box mt={2} p={2} bgcolor="#444654" borderRadius={2}>
                      <MarkdownRenderer content={recommendation} />
                    </Box>
                  </Box>

                  {/* Thumbs Up / Down */}
                  <Box mt={2} display="flex" justifyContent="center" gap={2}>
                    <Tooltip title="Thumbs Up">
                      <IconButton
                        sx={{
                          backgroundColor: "primary.main",
                          color: "#fff",
                          "&:hover": { backgroundColor: "primary.dark" },
                        }}
                        onClick={handleThumbsUp}
                      >
                        <ThumbUpAltIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Thumbs Down">
                      <IconButton
                        color="error"
                        sx={{ "&:hover": { backgroundColor: "#aa2e25" } }}
                        onClick={handleThumbsDownClick}
                      >
                        <ThumbDownAltIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  {/* ephemeral thumbs feedback */}
                  {tempFeedbackMessage && (
                    <Box mt={2} textAlign="center">
                      <Typography variant="body2" color="success.main">
                        {tempFeedbackMessage}
                      </Typography>
                    </Box>
                  )}

                  {/* Thumbs down feedback dialog */}
                  <Dialog
                    open={thumbsDownOpen}
                    onClose={handleThumbsDownClose}
                    fullWidth
                    maxWidth="sm"
                  >
                    <DialogTitle>Let us know what could be improved</DialogTitle>
                    <DialogContent>
                      <TextField
                        fullWidth
                        multiline
                        rows={4}
                        label="Comments"
                        value={thumbsDownComments}
                        onChange={(e) => setThumbsDownComments(e.target.value)}
                        placeholder="Please describe what's missing or could be better..."
                        sx={{ bgcolor: "background.paper", mt: 1 }}
                      />
                    </DialogContent>
                    <DialogActions sx={{ justifyContent: "center" }}>
                      <Button onClick={handleThumbsDownClose} color="inherit">
                        Close
                      </Button>
                      <Button onClick={handleThumbsDownSubmit} variant="contained" color="error">
                        Submit
                      </Button>
                    </DialogActions>
                  </Dialog>

                  {/* Edit or Follow-up */}
                  <Box mt={2} display="flex" justifyContent="center" gap={2}>
                    <Button variant="contained" onClick={handleGoBackToInput}>
                      Edit Your Responses
                    </Button>
                  </Box>

                  {followUpCount < 20 && (
                    <Box mt={4}>
                      <Typography variant="h6">
                        Follow-Up Questions ({followUpCount + 1}/20)
                      </Typography>
                      <TextField
                        fullWidth
                        variant="outlined"
                        label="Ask a follow-up question"
                        value={followupQuestion}
                        onChange={(e) => setFollowupQuestion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleFollowupSubmit();
                          }
                        }}
                        margin="normal"
                        disabled={followUpCount >= 20 || isFollowUpLoading}
                        sx={{ bgcolor: "background.paper" }}
                      />
                      <Box display="flex" gap={2} alignItems="center" mt={1}>
                        {isFollowUpLoading ? (
                          <Box display="flex" alignItems="center" gap={1}>
                            <CircularProgress size={24} />
                            <Typography variant="body2">Processing follow-up...</Typography>
                          </Box>
                        ) : (
                          <>
                            <Button
                              variant="contained"
                              color="primary"
                              disabled={followUpCount >= 20}
                              onClick={handleFollowupSubmit}
                            >
                              Send
                            </Button>
                            <Button
                              variant="contained"
                              sx={{
                                backgroundColor: "#10A37F",
                                "&:hover": { backgroundColor: "#19C58D" },
                              }}
                              onClick={handleRestart}
                            >
                              Restart
                            </Button>

                            {/* 2nd "Contact Data Team" button, with ephemeral message below */}
                            <Box>
                              <Button
                                variant="contained"
                                color="info"
                                startIcon={<HelpOutlineIcon />}
                                onClick={handleGetHelp}
                              >
                                Contact Data Team
                              </Button>
                              {tempHelpMessage && (
                                <Box mt={1}>
                                  <Typography variant="body2" sx={{ color: "info.main" }}>
                                    {tempHelpMessage}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          </>
                        )}
                      </Box>
                    </Box>
                  )}

                  {/* If there's conversation with the new or old follow-ups */}
                  {conversation.length > 0 && (
                    <Box mt={4}>
                      <Typography variant="h6">Conversation:</Typography>
                      {conversation.map((msg, index) => (
                        <Box
                          key={index}
                          sx={{
                            mt: 1,
                            display: "flex",
                            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                          }}
                        >
                          <Box
                            sx={{
                              borderRadius: 2,
                              p: 2,
                              maxWidth: "80%",
                              backgroundColor: msg.role === "user" ? "#10A37F" : "#444654",
                              color: msg.role === "user" ? "#fff" : "#ECECF1",
                              boxShadow: "0px 2px 4px rgba(0,0,0,0.2)",
                            }}
                          >
                            <strong>{msg.role === "user" ? "You:" : "Assistant:"}</strong>
                            <Box mt={1}>
                              <MarkdownRenderer content={msg.content} />
                            </Box>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Container>
              )}
            </Box>
          )}

          {/* --- Microsoft Internal Only Footer --- */}
          <Box mt={4} textAlign="center">
            <Typography variant="caption" sx={{ fontSize: "20px" }} color="textSecondary">
              Microsoft Internal Only
            </Typography>
          </Box>
          {/* --- End Footer --- */}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;