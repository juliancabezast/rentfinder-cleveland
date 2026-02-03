import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Trash2, User } from "lucide-react";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content: `Hi! I'm your data analyst. Ask me anything about your leads, calls, and showings. For example:

• What zip code has the highest conversion rate?
• What are the most common unanswered questions?
• Show me leads who mentioned urgency but didn't schedule
• What day gets the most inbound calls?
• Compare English vs Spanish call durations`,
  timestamp: new Date(),
};

const PLACEHOLDER_RESPONSE = `I'll be able to answer your questions once the OpenAI integration is configured. Head to **Settings → Integration Keys** to add your OpenAI API key.`;

export const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    // Simulate AI response delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const aiMessage: ChatMessage = {
      role: "assistant",
      content: PLACEHOLDER_RESPONSE,
      timestamp: new Date(),
    };

    setIsTyping(false);
    setMessages((prev) => [...prev, aiMessage]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE]);
  };

  return (
    <Card variant="glass" className="flex flex-col h-full">
      <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between py-3 px-4 border-b">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          AI Assistant
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </CardHeader>

      {/* Messages Area */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <MessageBubble key={index} message={message} />
            ))}

            {isTyping && <TypingIndicator />}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Input Area */}
      <div className="flex-shrink-0 p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your data..."
            className="resize-none min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isTyping}
            size="icon"
            className="bg-accent hover:bg-accent/90 text-accent-foreground flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </Card>
  );
};

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-primary/5 text-foreground rounded-tl-sm"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <p
          className={cn(
            "text-xs mt-1",
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {format(message.timestamp, "h:mm a")}
        </p>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
};

const TypingIndicator: React.FC = () => (
  <div className="flex gap-3">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
      <Sparkles className="h-4 w-4 text-primary" />
    </div>
    <div className="bg-primary/5 rounded-2xl rounded-tl-sm px-4 py-3">
      <div className="flex gap-1.5">
        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  </div>
);
