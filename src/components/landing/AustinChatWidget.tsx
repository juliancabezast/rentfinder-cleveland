import React, { useState, useEffect, useRef } from "react";
import { X, Send, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { SMS_CONSENT_LANGUAGE, buildConsentPayload } from "@/components/public/SmsConsentCheckbox";

const BOT_AVATAR_URL = "https://api.dicebear.com/9.x/bottts/svg?seed=austin&backgroundColor=370d4b";

type Message = {
  id: string;
  sender: "austin" | "user" | "typing";
  text: string;
  quickReplies?: string[];
  showForm?: boolean;
};

const RESPONSES: Record<string, { text: string; quickReplies?: string[]; showForm?: boolean }> = {
  "What does Rent Finder do?": {
    text: "We're an AI leasing assistant — we answer calls 24/7, qualify leads, and book showings automatically. 🏠",
    quickReplies: ["Sounds cool!", "How much?", "Talk to someone"],
  },
  "Sounds cool!": {
    text: "Right? Want me to have someone reach out? Just need your name and number!",
    showForm: true,
  },
  "How much does it cost?": {
    text: "14-day free trial, no card needed! Plans start at $99/mo depending on portfolio size.",
    quickReplies: ["Start Free Trial", "Talk to someone"],
  },
  "How much?": {
    text: "14-day free trial, no card needed! Plans start at $99/mo depending on portfolio size.",
    quickReplies: ["Start Free Trial", "Talk to someone"],
  },
  "I want a demo": {
    text: "Love it! Drop your info below and we'll set up a quick demo. 🚀",
    showForm: true,
  },
  "Start Free Trial": {
    text: "Awesome! Just need a few details to get you started. 👇",
    showForm: true,
  },
  "Talk to a human": {
    text: "Sure thing! Call us at (216) 630-8857 or leave your info and we'll call you.",
    quickReplies: ["Call now"],
    showForm: true,
  },
  "Talk to someone": {
    text: "Sure thing! Call us at (216) 630-8857 or leave your info and we'll call you.",
    quickReplies: ["Call now"],
    showForm: true,
  },
  "Leave my info": {
    text: "Perfect! Just drop your details below. 👇",
    showForm: true,
  },
  "Call now": {
    text: "Ring us at (216) 630-8857 — we're here Mon-Fri, 9am-6pm EST!",
    quickReplies: ["Leave my info", "What does Rent Finder do?"],
  },
};

const FALLBACK_RESPONSE = {
  text: "Hmm, let me connect you with a human! Leave your info or call (216) 630-8857.",
  quickReplies: ["Leave my info", "Call now"],
  showForm: false,
};

const INITIAL_QUICK_REPLIES = [
  "What does Rent Finder do?",
  "How much?",
  "I want a demo",
  "Talk to a human",
];

// Typing indicator component
const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1 px-4 py-3">
    <span className="w-2 h-2 rounded-full bg-accent animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: "0ms" }} />
    <span className="w-2 h-2 rounded-full bg-accent animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: "150ms" }} />
    <span className="w-2 h-2 rounded-full bg-accent animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: "300ms" }} />
  </div>
);
 
export const AustinChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [formData, setFormData] = useState({ fullName: "", email: "", phone: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Show bubble after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) {
        setShowBubble(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Initialize chat with Austin's greeting
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "1",
          sender: "austin",
          text: "Hey! 👋 I'm Austin. How can I help you today?",
          quickReplies: INITIAL_QUICK_REPLIES,
        },
      ]);
    }
  }, [isOpen, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);
 
  const handleOpen = () => {
    setIsOpen(true);
    setShowBubble(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const addUserMessage = (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Show typing indicator
    setIsTyping(true);

    // Simulate thinking delay (1.5 seconds)
    setTimeout(() => {
      setIsTyping(false);
      const response = RESPONSES[text] || FALLBACK_RESPONSE;
      const austinMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "austin",
        text: response.text,
        quickReplies: response.quickReplies,
        showForm: response.showForm,
      };
      setMessages((prev) => [...prev, austinMessage]);
    }, 1500);
  };
 
  const handleQuickReply = (reply: string) => {
    if (reply === "Call now") {
      window.location.href = "tel:2166308857";
      return;
    }
    addUserMessage(reply);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isTyping) return;
    addUserMessage(inputValue.trim());
    setInputValue("");
  };
 
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.phone) {
      toast.error("Please fill out all fields");
      return;
    }

    if (!smsConsent) {
      toast.error("Please agree to receive calls and SMS messages");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/submit-demo-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            "apikey": SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            full_name: formData.fullName.trim(),
            email: formData.email.trim().toLowerCase(),
            phone: formData.phone.trim().replace(/\D/g, ""),
            ...buildConsentPayload(smsConsent),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit");
      }

      setFormSubmitted(true);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "austin",
          text: "You're all set! We'll reach out within 24 hours. 🎉",
          quickReplies: ["What does Rent Finder do?"],
        },
      ]);
      setFormData({ fullName: "", email: "", phone: "" });
      setSmsConsent(false);
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
 
  return (
    <>
      {/* Floating Avatar Button */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2">
        {/* Speech Bubble */}
        {showBubble && !isOpen && (
          <div
            className="animate-fade-in bg-card border border-border rounded-2xl rounded-br-sm px-4 py-3 shadow-lg cursor-pointer max-w-[200px]"
            onClick={handleOpen}
          >
            <p className="text-sm font-medium text-foreground">Need help? Let's chat! 👋</p>
          </div>
        )}

        {/* Avatar Button */}
        {!isOpen && (
          <button
            onClick={handleOpen}
            className="group relative flex flex-col items-center gap-1 focus:outline-none"
            aria-label="Open chat with Austin"
          >
            {/* Pulsing rings */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="absolute w-14 h-14 rounded-full bg-accent/40 animate-[ping_2s_ease-out_infinite]" />
              <span className="absolute w-14 h-14 rounded-full bg-accent/30 animate-[ping_2s_ease-out_0.3s_infinite]" />
              <span className="absolute w-14 h-14 rounded-full bg-accent/20 animate-[ping_2s_ease-out_0.6s_infinite]" />
            </div>
            <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/80 p-0.5 shadow-lg hover:scale-105 transition-transform z-10">
              <div className="w-full h-full rounded-full bg-primary flex items-center justify-center overflow-hidden p-1">
                <img
                  src={BOT_AVATAR_URL}
                  alt="Austin"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <span className="text-xs font-semibold text-foreground bg-background/90 px-2 py-0.5 rounded-full shadow-sm">
              Austin
            </span>
          </button>
        )}
      </div>
 
      {/* Chat Panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-[100] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden",
            "bottom-6 right-6 w-[350px] h-[500px] max-h-[80vh]",
            "max-sm:bottom-0 max-sm:right-0 max-sm:left-0 max-sm:w-full max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none",
            "animate-scale-in"
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/20 p-1">
              <img
                src={BOT_AVATAR_URL}
                alt="Austin"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Austin</p>
              <p className="text-xs text-primary-foreground/80">AI Leasing Assistant</p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
 
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.sender === "austin"
                      ? "bg-muted text-foreground rounded-bl-sm"
                      : "bg-primary text-primary-foreground rounded-br-sm ml-auto"
                  )}
                >
                  {msg.text}
                </div>

                {/* Quick Replies */}
                {msg.sender === "austin" && msg.quickReplies && !isTyping && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {msg.quickReplies.map((reply) => (
                      <button
                        key={reply}
                        onClick={() => handleQuickReply(reply)}
                        className={cn(
                          "text-xs font-medium px-3 py-1.5 rounded-full border transition-colors",
                          reply === "Call now"
                            ? "border-accent bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground"
                            : "border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                        )}
                      >
                        {reply === "Call now" && <Phone className="inline h-3 w-3 mr-1" />}
                        {reply}
                      </button>
                    ))}
                  </div>
                )}

                {/* Inline Form */}
                {msg.sender === "austin" && msg.showForm && !formSubmitted && (
                  <form onSubmit={handleFormSubmit} className="mt-3 space-y-3 bg-muted/50 rounded-xl p-3">
                    <div>
                      <Label htmlFor="chat-name" className="text-xs">
                        Name
                      </Label>
                      <Input
                        id="chat-name"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder="John Smith"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="chat-phone" className="text-xs">
                        Phone
                      </Label>
                      <Input
                        id="chat-phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(216) 555-0123"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="chat-email" className="text-xs">
                        Email
                      </Label>
                      <Input
                        id="chat-email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="john@company.com"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex items-start gap-2 pt-1">
                      <Checkbox
                        id="chat-sms-consent"
                        checked={smsConsent}
                        onCheckedChange={(val) => setSmsConsent(val as boolean)}
                      />
                      <label htmlFor="chat-sms-consent" className="text-[10px] leading-tight text-muted-foreground cursor-pointer">
                        {SMS_CONSENT_LANGUAGE} View our{" "}
                        <a href="https://rentfindercleveland.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline" onClick={(e) => e.stopPropagation()}>Privacy Policy</a>
                        {" "}and{" "}
                        <a href="https://rentfindercleveland.com/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="text-primary underline" onClick={(e) => e.stopPropagation()}>Terms</a>.
                      </label>
                    </div>
                    <Button type="submit" size="sm" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Sending..." : "Send"}
                    </Button>
                  </form>
                )}
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted">
                <TypingIndicator />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
 
          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
                className="flex-1"
                disabled={isTyping}
              />
              <Button size="icon" onClick={handleSend} disabled={!inputValue.trim() || isTyping}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
