import React from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";

interface PublicLayoutProps {
  children: React.ReactNode;
  organizationName?: string;
  organizationLogo?: string | null;
}

export const PublicLayout: React.FC<PublicLayoutProps> = ({
  children,
  organizationName = "Rent Finder Cleveland",
  organizationLogo,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/p/properties" className="flex items-center gap-2">
            {organizationLogo ? (
              <img
                src={organizationLogo}
                alt={organizationName}
                className="h-10 w-auto"
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary p-2">
                  <Building2 className="h-6 w-6 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold text-primary">
                  {organizationName}
                </span>
              </div>
            )}
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              to="/p/properties"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              Properties
            </Link>
            <Link
              to="/auth/login"
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Agent Login
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t bg-card py-8">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Branding */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-lg bg-primary p-2">
                  <Building2 className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-primary">{organizationName}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your trusted partner in finding Section 8 friendly rental
                properties in Cleveland.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-medium mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/p/properties" className="hover:text-primary transition-colors">
                    Browse Properties
                  </Link>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-medium mb-4">Contact Us</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a
                    href="tel:+12163550000"
                    className="hover:text-primary transition-colors"
                  >
                    (216) 355-0000
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:info@rentfindercleveland.com"
                    className="hover:text-primary transition-colors"
                  >
                    info@rentfindercleveland.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>
              Powered by{" "}
              <span className="font-medium text-primary">Rent Finder Cleveland</span>
            </p>
            <p className="mt-1">
              © {new Date().getFullYear()} All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
