import React from "react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { Card, CardContent } from "@/components/ui/card";

const PrivacyPolicy: React.FC = () => {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>

        <Card>
          <CardContent className="prose prose-sm max-w-none py-8 space-y-8">
            <p className="text-muted-foreground">
              Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>

            {/* Data Collection */}
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Data Collection</h2>
              <p className="text-muted-foreground mb-3">
                We collect information you provide directly to us, including:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Name and contact information (phone number, email address)</li>
                <li>Housing preferences (budget, move-in date, property interests)</li>
                <li>Section 8 voucher information (if applicable)</li>
                <li>Communication preferences and consent records</li>
                <li>Device information and browser type when you visit our website</li>
              </ul>
            </section>

            {/* Use of Information */}
            <section>
              <h2 className="text-xl font-semibold mb-3">2. Use of Information</h2>
              <p className="text-muted-foreground mb-3">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Help you find suitable rental properties</li>
                <li>Contact you about properties matching your criteria</li>
                <li>Schedule and confirm property showings</li>
                <li>Send automated calls and text messages (with your consent)</li>
                <li>Improve our services and user experience</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            {/* Information Sharing */}
            <section>
              <h2 className="text-xl font-semibold mb-3">3. Information Sharing</h2>
              <p className="text-muted-foreground mb-3">
                We may share your information with:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Property owners and managers for properties you're interested in</li>
                <li>Service providers who assist in our operations (e.g., communication platforms)</li>
                <li>Legal authorities when required by law</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                We do not sell your personal information to third parties.
              </p>
            </section>

            {/* Your Rights */}
            <section>
              <h2 className="text-xl font-semibold mb-3">4. Your Rights</h2>
              <p className="text-muted-foreground mb-3">
                You have the right to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your information</li>
                <li>Opt out of marketing communications at any time</li>
                <li>Withdraw consent for automated calls and texts by replying STOP</li>
              </ul>
            </section>

            {/* Communication Consent */}
            <section>
              <h2 className="text-xl font-semibold mb-3">5. Communication Consent (TCPA)</h2>
              <p className="text-muted-foreground mb-3">
                By providing your phone number and checking the consent box on our forms, you agree to receive:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Automated phone calls about rental properties</li>
                <li>Text messages (SMS) about available listings and showings</li>
                <li>Follow-up communications related to your housing search</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                Message and data rates may apply. You may opt out at any time by replying STOP
                to any text message or by contacting us directly.
              </p>
            </section>

            {/* Data Security */}
            <section>
              <h2 className="text-xl font-semibold mb-3">6. Data Security</h2>
              <p className="text-muted-foreground">
                We implement appropriate technical and organizational measures to protect your
                personal information against unauthorized access, alteration, disclosure, or
                destruction. However, no method of transmission over the Internet is 100% secure.
              </p>
            </section>

            {/* Contact Information */}
            <section>
              <h2 className="text-xl font-semibold mb-3">7. Contact Us</h2>
              <p className="text-muted-foreground mb-3">
                If you have questions about this Privacy Policy or wish to exercise your rights,
                please contact us:
              </p>
              <div className="text-muted-foreground">
                <p><strong>Rent Finder Cleveland</strong></p>
                <p>Phone: (216) 355-0000</p>
                <p>Email: privacy@rentfindercleveland.com</p>
              </div>
            </section>

            {/* Changes */}
            <section>
              <h2 className="text-xl font-semibold mb-3">8. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time. We will notify you of any
                changes by posting the new Privacy Policy on this page and updating the "Last
                updated" date.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default PrivacyPolicy;
