export const AI_CREDITS_EXHAUSTED_MESSAGE = "You have run out of AI Credits, please contact admin to recharge.";

export function isAiCreditsExhausted(error: unknown) {
  const value = error as { code?: string; message?: string; error?: { code?: string; message?: string } };
  const code = `${value?.code ?? ""} ${value?.error?.code ?? ""}`.toLowerCase();
  const message = `${value?.message ?? ""} ${value?.error?.message ?? ""}`.toLowerCase();
  return code.includes("insufficient_quota") || message.includes("exceeded your current quota") || message.includes("credit balance") || message.includes("billing hard limit");
}
