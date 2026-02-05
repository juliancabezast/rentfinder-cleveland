import React, { useState, useEffect, useRef } from "react";
 import { X, Send, Phone } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { toast } from "sonner";
 import { cn } from "@/lib/utils";

const BOT_AVATAR_URL = "https://api.dicebear.com/9.x/bottts/svg?seed=austin&backgroundColor=370d4b";
 
 type Message = {
   id: string;
   sender: "austin" | "user";
   text: string;
   quickReplies?: string[];
   showForm?: boolean;
 };
 
 const RESPONSES: Record<string, { text: string; quickReplies?: string[]; showForm?: boolean }> = {
   "What does Rent Finder do?": {
     text: "Rent Finder Cleveland is an AI leasing assistant that automates your lead management. Our AI voice agents answer calls 24/7, qualify prospects, schedule showings, and follow up automatically. Property managers typically see 3x more showings booked and 60% fewer no-shows. Would you like to start a free trial?",
     quickReplies: ["Start Free Trial", "Tell me about pricing", "Talk to a human"],
   },
   "How much does it cost?": {
     text: "We offer a 14-day free trial with no credit card required. Our plans scale based on your portfolio size — from Starter (up to 10 properties) to Enterprise (unlimited). Want me to get you connected with our team for custom pricing?",
     quickReplies: ["Start Free Trial", "Talk to someone", "What features are included?"],
   },
   "Tell me about pricing": {
     text: "We offer a 14-day free trial with no credit card required. Our plans scale based on your portfolio size — from Starter (up to 10 properties) to Enterprise (unlimited). Want me to get you connected with our team for custom pricing?",
     quickReplies: ["Start Free Trial", "Talk to someone", "What features are included?"],
   },
   "What features are included?": {
     text: "Every plan includes: AI voice agents for inbound/outbound calls, automated lead scoring, showing scheduling & confirmations, no-show follow-ups, TCPA compliance tools, real-time analytics dashboard, and Section 8 voucher tracking. Enterprise adds custom integrations, dedicated support, and unlimited properties.",
     quickReplies: ["Start Free Trial", "Talk to a human"],
   },
   "I want a demo": {
     text: "Great! Just fill out your info below and we'll get you set up with a personalized demo.",
     showForm: true,
   },
   "Start Free Trial": {
     text: "Awesome! Let's get you started. Just fill out your info below.",
     showForm: true,
   },
   "Talk to a human": {
     text: "You can reach us directly at (216) 630-8857. Or leave your info below and we'll call you back!",
     quickReplies: ["Call now"],
     showForm: true,
   },
   "Talk to someone": {
     text: "You can reach us directly at (216) 630-8857. Or leave your info below and we'll call you back!",
     quickReplies: ["Call now"],
     showForm: true,
   },
   "Leave my info": {
     text: "Perfect! Just fill out the form below and someone will reach out shortly.",
     showForm: true,
   },
   "Call now": {
     text: "You can reach us at (216) 630-8857. We're available Monday-Friday, 9am-6pm EST.",
     quickReplies: ["Leave my info", "What does Rent Finder do?"],
   },
 };
 
 const FALLBACK_RESPONSE = {
   text: "I'm still learning! For detailed questions, you can reach us at (216) 630-8857 or leave your info and I'll have someone follow up.",
   quickReplies: ["Leave my info", "Call now"],
   showForm: false,
 };
 
 const INITIAL_QUICK_REPLIES = [
   "What does Rent Finder do?",
   "How much does it cost?",
   "I want a demo",
   "Talk to a human",
 ];
 
 const AustinChatWidget: React.FC = () => {
   const [isOpen, setIsOpen] = useState(false);
   const [showBubble, setShowBubble] = useState(false);
   const [messages, setMessages] = useState<Message[]>([]);
   const [inputValue, setInputValue] = useState("");
   const [formData, setFormData] = useState({ fullName: "", email: "", phone: "" });
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [formSubmitted, setFormSubmitted] = useState(false);
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
           text: "Hi! I'm Austin, your Rent Finder Cleveland assistant. How can I help you today?",
           quickReplies: INITIAL_QUICK_REPLIES,
         },
       ]);
     }
   }, [isOpen, messages.length]);
 
   // Scroll to bottom on new messages
   useEffect(() => {
     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
   }, [messages]);
 
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
 
     // Get response
     setTimeout(() => {
       const response = RESPONSES[text] || FALLBACK_RESPONSE;
       const austinMessage: Message = {
         id: (Date.now() + 1).toString(),
         sender: "austin",
         text: response.text,
         quickReplies: response.quickReplies,
         showForm: response.showForm,
       };
       setMessages((prev) => [...prev, austinMessage]);
     }, 500);
   };
 
   const handleQuickReply = (reply: string) => {
     if (reply === "Call now") {
       window.location.href = "tel:2166308857";
       return;
     }
     addUserMessage(reply);
   };
 
   const handleSend = () => {
     if (!inputValue.trim()) return;
     addUserMessage(inputValue.trim());
     setInputValue("");
   };
 
   const handleFormSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!formData.fullName || !formData.email || !formData.phone) {
       toast.error("Please fill out all fields");
       return;
     }
 
     setIsSubmitting(true);
     try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-demo-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            full_name: formData.fullName.trim(),
            email: formData.email.trim().toLowerCase(),
            phone: formData.phone.trim().replace(/\D/g, ""),
          }),
        }
      );
 
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to submit");
      }
 
       setFormSubmitted(true);
       setMessages((prev) => [
         ...prev,
         {
           id: Date.now().toString(),
           sender: "austin",
           text: "Thanks! We'll reach out within 24 hours to get you set up. 🎉",
           quickReplies: ["What does Rent Finder do?"],
         },
       ]);
       setFormData({ fullName: "", email: "", phone: "" });
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
             <p className="text-sm font-medium text-foreground">How Can I Assist You Today?</p>
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
               className="p-1 hover:bg-white/20 rounded-lg transition-colors"
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
                 {msg.sender === "austin" && msg.quickReplies && (
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
                         Full Name
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
                     <Button type="submit" size="sm" className="w-full" disabled={isSubmitting}>
                       {isSubmitting ? "Submitting..." : "Submit"}
                     </Button>
                   </form>
                 )}
               </div>
             ))}
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
               />
               <Button size="icon" onClick={handleSend} disabled={!inputValue.trim()}>
                 <Send className="h-4 w-4" />
               </Button>
             </div>
           </div>
         </div>
       )}
     </>
   );
 };
 
 export default AustinChatWidget;