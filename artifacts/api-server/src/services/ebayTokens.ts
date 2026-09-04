// services/ebayTokens.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface EbayTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
  token_type: string;
}

export async function getTokens(userId: string): Promise<EbayTokens | null> {
  const { data, error } = await supabaseAdmin
    .from("ebay_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(data.expires_at).getTime(),
    token_type: data.token_type,
  };
}

export async function saveTokens(userId: string, tokens: EbayTokens): Promise<void> {
  const { error } = await supabaseAdmin.from("ebay_tokens").upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(tokens.expires_at).toISOString(),
    token_type: tokens.token_type,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteTokens(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("ebay_tokens").delete().eq("user_id", userId);
  if (error) throw error;
}

export function hasValidTokens(tokens: EbayTokens | null): tokens is EbayTokens {
  return tokens !== null && tokens.expires_at > Date.now();
}

export async function getAllConnectedUserIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("ebay_tokens").select("user_id");
  if (error) throw error;
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}