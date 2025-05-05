import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig";

const pca = new PublicClientApplication(msalConfig);

ReactDOM.render(
  <MsalProvider instance={pca}>
    <App />
  </MsalProvider>,
  document.getElementById("root")
);