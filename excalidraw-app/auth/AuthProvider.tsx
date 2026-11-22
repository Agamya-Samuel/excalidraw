import React, { useEffect } from "react";

import { useSetAtom } from "../app-jotai";
import { getSupabase, isCloudEnabled } from "../lib/supabase";

import { authStatusAtom, authUserAtom } from "./authAtoms";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const setUser = useSetAtom(authUserAtom);
  const setStatus = useSetAtom(authStatusAtom);

  useEffect(() => {
    if (!isCloudEnabled()) {
      setStatus("unauthenticated");
      return;
    }

    const supabase = getSupabase();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setUser(data.session?.user ?? null);
      setStatus(data.session?.user ? "authenticated" : "unauthenticated");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session?.user ? "authenticated" : "unauthenticated");
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [setStatus, setUser]);

  return <>{children}</>;
};

export const signInWithEmail = async (email: string, password: string) => {
  const { error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw error;
  }
};

export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) {
    throw error;
  }
  return data;
};

export const sendPasswordReset = async (email: string) => {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) {
    throw error;
  }
};

export const resendConfirmationEmail = async (email: string) => {
  const { error } = await getSupabase().auth.resend({ type: "signup", email });
  if (error) {
    throw error;
  }
};

export const signInWithOAuth = async (provider: "google" | "github") => {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) {
    throw error;
  }
};

export const signOut = async () => {
  const { error } = await getSupabase().auth.signOut();
  if (error) {
    throw error;
  }
};
