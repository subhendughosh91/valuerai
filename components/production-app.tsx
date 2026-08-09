"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";
import { ValuationWorkspace } from "./valuation-workspace";
import { AdminWorkspace } from "./admin-workspace";

type Profile = {
  display_name: string;
  role: "USER" | "ADMIN";
  state_code: string;
};

export function ProductionApp() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginRole, setLoginRole] = useState<Profile["role"]>("USER");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const supabase = createSupabaseBrowserClient();

  async function load(): Promise<Profile | null> {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      setProfile(null);
      setLoading(false);
      return null;
    }

    const { data } = await supabase
      .from("profiles")
      .select("display_name,role,state_code")
      .eq("id", user.id)
      .single();

    const loadedProfile = data as Profile | null;
    setProfile(loadedProfile);
    setLoading(false);
    return loadedProfile;
  }

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!session) {
        setProfile(null);
        setLoading(false);
        return;
      }

      void load();
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    const signedInProfile = await load();
    if (!signedInProfile || signedInProfile.role !== loginRole) {
      await supabase.auth.signOut();
      setProfile(null);
      setMessage(loginRole === "ADMIN"
        ? "This account is not authorised for Admin access. Select User to sign in."
        : "This is an Admin account. Select Admin to sign in.");
    }
  }

  if (loading) {
    return <main className="auth-panel"><p className="muted">Loading ValuerAI…</p></main>;
  }

  if (profile) {
    if (profile.role === "ADMIN") return <AdminWorkspace profile={profile} onSignOut={() => supabase.auth.signOut().then(() => location.assign("/"))} />;
    return <ValuationWorkspace profile={profile} onSignOut={() => supabase.auth.signOut().then(() => location.assign("/"))} />;
  }

  return (
    <main className="login-page">
      <section className="brand-panel">
        <a className="logo" href="/">
          <span className="logo-mark">V</span><span>Valuer<span>AI</span></span>
        </a>
        <div className="brand-copy">
          <p className="eyebrow">PROPERTY INTELLIGENCE</p>
          <h1>Better evidence.<br />Clearer valuations.</h1>
          <p>Sign in to your secure valuation workspace.</p>
        </div>
      </section>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={signIn} method="post">
          <p className="eyebrow">WELCOME TO VALUERAI</p>
          <h2>Sign in to your workspace</h2>
          <div className="role-picker" aria-label="Choose account type">
            <button type="button" className={loginRole === "USER" ? "selected" : ""} onClick={() => setLoginRole("USER")}>
              User<span>Professional workspace</span>
            </button>
            <button type="button" className={loginRole === "ADMIN" ? "selected" : ""} onClick={() => setLoginRole("ADMIN")}>
              Admin<span>Owner access only</span>
            </button>
          </div>
          <label className="label">Email address<input name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="label">Password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {message && <p className="notice">{message}</p>}
          <button className="button primary wide">Sign in</button>
          <p className="switch">New to ValuerAI? <a href="/register">Create an account</a></p>
        </form>
      </section>
    </main>
  );
}
