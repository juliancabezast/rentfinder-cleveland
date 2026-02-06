import React, { useState, useEffect, useCallback } from "react";
import { X, Home } from "lucide-react";
 import { cn } from "@/lib/utils";
 
 const SOCIAL_PROOF_DATA = [
  { name: "Emily Johnson", address: "1847 Cedar Ave, Cleveland", avatarId: 1 },
  { name: "Marcus Williams", address: "3921 Denison Ave, Cleveland", avatarId: 2 },
  { name: "Sarah Mitchell", address: "2156 W 28th St, Cleveland", avatarId: 3 },
  { name: "David Thompson", address: "4483 Pearl Rd, Cleveland", avatarId: 4 },
  { name: "Jessica Rivera", address: "1629 Payne Ave, Cleveland", avatarId: 5 },
  { name: "Michael Chen", address: "2874 Scranton Rd, Cleveland", avatarId: 6 },
  { name: "Amanda Foster", address: "3347 Fulton Rd, Cleveland", avatarId: 7 },
  { name: "Robert Garcia", address: "1958 W 25th St, Cleveland", avatarId: 8 },
  { name: "Lauren Brooks", address: "4216 Lorain Ave, Cleveland", avatarId: 9 },
  { name: "James Patterson", address: "2743 Bridge Ave, Cleveland", avatarId: 10 },
  { name: "Nicole Stewart", address: "1482 Literary Rd, Cleveland", avatarId: 11 },
  { name: "Christopher Davis", address: "3165 Trowbridge Ave, Cleveland", avatarId: 12 },
 ];
 
 const TIMESTAMPS = [
   "just now",
   "1 minute ago",
   "2 minutes ago",
   "3 minutes ago",
   "5 minutes ago",
   "7 minutes ago",
 ];
 
 export const SocialProofToast: React.FC = () => {
   const [currentIndex, setCurrentIndex] = useState(0);
   const [isVisible, setIsVisible] = useState(false);
   const [isAnimating, setIsAnimating] = useState(false);
   const [isDismissed, setIsDismissed] = useState(false);
 
   // Check sessionStorage on mount
   useEffect(() => {
     const dismissed = sessionStorage.getItem("socialProofDismissed");
     if (dismissed === "true") {
       setIsDismissed(true);
     }
   }, []);
 
   const showToast = useCallback(() => {
     if (isDismissed) return;
     setIsAnimating(true);
     setIsVisible(true);
 
    // Hide after 6 seconds
     setTimeout(() => {
       setIsAnimating(false);
       setTimeout(() => {
         setIsVisible(false);
         setCurrentIndex((prev) => (prev + 1) % SOCIAL_PROOF_DATA.length);
       }, 300);
    }, 6000);
   }, [isDismissed]);
 
   useEffect(() => {
     if (isDismissed) return;
 
     // First toast after 6 seconds
     const initialTimeout = setTimeout(() => {
       showToast();
     }, 6000);
 
     return () => clearTimeout(initialTimeout);
   }, [isDismissed, showToast]);
 
   useEffect(() => {
     if (isDismissed || currentIndex === 0) return;
 
    // Subsequent toasts every 10-12 seconds (randomized)
    const delay = 10000 + Math.random() * 2000;
     const timeout = setTimeout(() => {
       showToast();
     }, delay);
 
     return () => clearTimeout(timeout);
   }, [currentIndex, isDismissed, showToast]);
 
   // Set up rotation after first toast
   useEffect(() => {
     if (isDismissed) return;
 
     // After the first toast cycle completes, start the rotation
     const rotationInterval = setInterval(() => {
       if (!isVisible) {
         showToast();
       }
    }, 10500);
 
     return () => clearInterval(rotationInterval);
   }, [isDismissed, isVisible, showToast]);
 
   const handleDismiss = () => {
     setIsDismissed(true);
     setIsVisible(false);
     sessionStorage.setItem("socialProofDismissed", "true");
   };
 
   if (isDismissed) return null;
 
   const currentData = SOCIAL_PROOF_DATA[currentIndex];
  const timestamp = TIMESTAMPS[currentIndex % TIMESTAMPS.length];
 
   return (
     <div
       className={cn(
         "fixed bottom-6 left-6 z-[90] max-w-[300px] hidden sm:block",
        "transition-all duration-500 ease-out",
         isVisible && isAnimating
          ? "translate-x-0 opacity-100 scale-100"
          : "-translate-x-full opacity-0 scale-95 pointer-events-none"
       )}
     >
      <div className="bg-card border border-border rounded-xl shadow-xl p-3 pr-8 relative ring-1 ring-accent/20 shadow-accent/10">
         {/* Close button */}
         <button
           onClick={handleDismiss}
           className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
           aria-label="Dismiss notification"
         >
           <X className="h-3.5 w-3.5" />
         </button>
 
         <div className="flex items-start gap-3">
           {/* Avatar with online indicator */}
           <div className="relative flex-shrink-0">
            <img
              src={`https://i.pravatar.cc/40?img=${currentData.avatarId}`}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-card" />
           </div>
 
           {/* Content */}
           <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Home className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-medium text-accent">New Application</span>
            </div>
            <p className="text-sm text-foreground leading-snug">
               <span className="font-semibold">{currentData.name}</span>
              {" applied for "}
               <span className="text-muted-foreground">{currentData.address}</span>
             </p>
             <p className="text-xs text-muted-foreground/70 mt-1">{timestamp}</p>
           </div>
         </div>
       </div>
     </div>
   );
 };
 
