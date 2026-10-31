import type { Metadata } from "next";
import { SignInPanel } from "@/components/signin/SignInPanel";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Connect this site to your own NeuroPal server, check the connection, and sign in if your server has accounts.",
};

export default function SignInPage() {
  return (
    <div className="np-container np-page">
      <header className="np-section-head">
        <p className="np-label">Sign in</p>
        <h1 className="np-display np-h1">Connect to your NeuroPal</h1>
        <p className="np-lead">
          NeuroPal runs on a server you control, such as a computer at home. Connect this site to it to check that it is
          up and to save your look to the app.
        </p>
      </header>
      <SignInPanel />
    </div>
  );
}
