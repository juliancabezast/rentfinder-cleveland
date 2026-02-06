import React from "react";
import { Loader2 } from "lucide-react";

interface ProfileSetupScreenProps {
  message?: string;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  message = "Setting up your account...",
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <p className="text-lg text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};

export default ProfileSetupScreen;
