export type NewsletterLlmProvider = "mistral" | "openai" | "anthropic" | "google";

export interface NewsletterLlmProviderOption {
  id: NewsletterLlmProvider;
  label: string;
  defaultModel: string;
  keyUrl: string;
  keyPlaceholder: string;
}

export const NEWSLETTER_LLM_PROVIDERS: NewsletterLlmProviderOption[] = [
  {
    id: "mistral",
    label: "Mistral",
    defaultModel: "mistral-small-latest",
    keyUrl: "https://console.mistral.ai/",
    keyPlaceholder: "sk-…",
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    defaultModel: "gpt-5.4-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    defaultModel: "claude-sonnet-4-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    defaultModel: "gemini-3.6-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
  },
];

export function newsletterLlmProviderOption(
  id: string | null | undefined
): NewsletterLlmProviderOption {
  return (
    NEWSLETTER_LLM_PROVIDERS.find((item) => item.id === id) ?? NEWSLETTER_LLM_PROVIDERS[0]
  );
}

export function isNewsletterLlmProvider(id: string): id is NewsletterLlmProvider {
  return NEWSLETTER_LLM_PROVIDERS.some((item) => item.id === id);
}
