// Synthetic examples shared by the policy and relay tests.
export const blockedResaleMessages = [
  ["empty message", ""],
  ["over length", "a".repeat(1001)],
  ["email", "Please email resale.test+chair@example.com"],
  ["phone", "My number is +1 (202) 555-0199"],
  ["HTTP link", "See http://example.com/chair"],
  ["HTTPS link", "See HTTPS://example.com/chair"],
  ["www link", "See www.example.com"],
  ["street address", "Meet at 123 Main Street"],
  ["abbreviated address", "Meet at 42 Oak Rd"],
  ["multiword address", "Meet at 987 West Maple Grove Avenue"],
  ["Venmo", "Please pay with VENMO"],
  ["Cash App", "Send it through Cash App"],
  ["CashApp", "Send it through cashapp"],
  ["PayPal", "Can you use PayPal?"],
  ["text request", "Text me tomorrow"],
  ["call request", "Call me tomorrow"],
] as const;

export const allowedResaleMessages = [
  ["availability and offer", "Is the chair still available? I can offer $25."],
  ["condition", "It has a small scratch but is sturdy."],
  ["pickup", "Can we meet at the approved shelter pickup tomorrow?"],
  ["checkout", "I will pay through the rescue checkout."],
  ["ordinary numbers", "It is 24 inches wide and 36 inches tall."],
  ["word boundaries", "The driveway photo shows the chair beside the street sign."],
  ["one character", "a"],
  ["below boundary", "a".repeat(999)],
  ["exact boundary", "a".repeat(1000)],
] as const;
