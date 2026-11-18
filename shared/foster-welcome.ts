import type { HelpSettings } from "./rescue-help";

export const fosterWelcomeText = `🐾 Welcome to the Haseya’s Family! ❤️

We’re so excited to officially welcome you as a foster with Haseya’s New Beginning Animal Rescue!

Thank you for opening your heart and home to animals in need. Our fosters are such an important part of our rescue, and we truly couldn’t save as many lives without people like you!

🐾 One last thing! Please reply to this message with a screenshot of your Facebook profile so we can find you and add you to our private Haseya’s Foster Facebook Group.

This group is where we share updates, ask questions, offer support, and help each other along the way!

Remember, you’re never alone in fostering. We’re here to help you every step of the way!

❤️ Welcome to the family, and thank you for being part of their new beginning!

— Haseya’s New Beginning Animal Rescue 🐾`;

export function fosterTopic(settings: HelpSettings) {
  // Match the configured category, never a volunteer's name or a keyword guess.
  return settings.topics.find(t => t.label.trim().toLowerCase() === "foster");
}

export function fosterPhone(raw?: string | null) {
  const digits = (raw || "").replace(/\D/g, "");
  return /^\d{10}$/.test(digits) ? `+1${digits}` : /^1\d{10}$/.test(digits) ? `+${digits}` : null;
}
