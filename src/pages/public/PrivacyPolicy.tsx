import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  { id: "introduction", title: "1. Introduction" },
  { id: "information-we-collect", title: "2. Information We Collect" },
  { id: "how-we-use-information", title: "3. How We Use Information" },
  { id: "legal-basis", title: "4. Legal Basis for Processing" },
  { id: "information-sharing", title: "5. Information Sharing" },
  { id: "sms-messaging", title: "6. SMS/Text Messaging" },
  { id: "tcpa-compliance", title: "7. TCPA Compliance" },
  { id: "fair-housing", title: "8. Fair Housing Act Compliance" },
  { id: "data-retention", title: "9. Data Retention" },
  { id: "your-rights", title: "10. Your Rights" },
  { id: "data-security", title: "11. Data Security" },
  { id: "childrens-privacy", title: "12. Children's Privacy" },
  { id: "policy-changes", title: "13. Changes to This Policy" },
  { id: "contact", title: "14. Contact Information" },
];

const PrivacyPolicy: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl text-foreground">Rent Finder Cleveland</span>
          </Link>
          <Button variant="ghost" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">
            Effective Date: February 1, 2025 | Last Updated: February 5, 2025
          </p>

          {/* Table of Contents */}
          <nav className="bg-muted/50 rounded-xl p-6 mb-12">
            <h2 className="text-lg font-semibold text-foreground mb-4">Table of Contents</h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="prose prose-sm max-w-none space-y-12">
            {/* Section 1: Introduction */}
            <section id="introduction">
              <h2 className="text-xl font-semibold text-foreground mb-4">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Welcome to Rent Finder Cleveland. This Privacy Policy explains how Rent Finder Cleveland, LLC
                (operating as "HomeGuard") ("Company," "we," "us," or "our"), a limited liability company organized under the laws of
                the State of Ohio with its principal place of business in Cleveland, Ohio, United States,
                collects, uses, discloses, and protects your personal information.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                This Privacy Policy applies to information collected through our website at rentfindercleveland.com, 
                our AI-powered leasing automation platform, and all related services, applications, and tools 
                (collectively, the "Service").
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Rent Finder Cleveland provides Software-as-a-Service (SaaS) solutions to property managers, 
                helping them automate lead management, communications, and showing scheduling through AI-powered 
                voice agents and intelligent automation. By accessing or using our Service, you agree to the 
                terms of this Privacy Policy.
              </p>
            </section>

            {/* Section 2: Information We Collect */}
            <section id="information-we-collect">
              <h2 className="text-xl font-semibold text-foreground mb-4">2. Information We Collect</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">2.1 Account Information (Property Managers)</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                When you register for our Service as a property manager, we collect:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li>Full name and job title</li>
                <li>Business email address and phone number</li>
                <li>Company name and business address</li>
                <li>Billing information (processed securely through our payment processor)</li>
                <li>Login credentials (passwords are encrypted and never stored in plain text)</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">2.2 Lead Data (Processed on Behalf of Property Managers)</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We process the following information about rental prospects on behalf of our property manager clients:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li>Prospect names and contact information (phone, email)</li>
                <li>Housing preferences (budget range, desired move-in date, property features)</li>
                <li>Section 8 Housing Choice Voucher information (voucher amount, housing authority, expiration date)</li>
                <li>Communication history and preferences</li>
                <li>Showing history and engagement data</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">2.3 Usage Data</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We automatically collect certain information when you use our Service:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li>IP addresses and approximate geographic location</li>
                <li>Browser type, version, and operating system</li>
                <li>Device information and identifiers</li>
                <li>Pages visited, features used, and time spent on the Service</li>
                <li>Referring URLs and exit pages</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">2.4 Communication Data</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                With appropriate consent, we collect and process:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li>Call recordings and transcripts from AI-assisted phone calls</li>
                <li>SMS message logs and content</li>
                <li>Email communications sent through our platform</li>
                <li>Consent records and opt-out preferences</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">2.5 Cookies and Tracking Technologies</h3>
              <p className="text-muted-foreground leading-relaxed">
                We use cookies, web beacons, and similar technologies to enhance your experience, 
                analyze usage patterns, and deliver relevant content. You can control cookie preferences 
                through your browser settings, though some features may not function properly without cookies.
              </p>
            </section>

            {/* Section 3: How We Use Information */}
            <section id="how-we-use-information">
              <h2 className="text-xl font-semibold text-foreground mb-4">3. How We Use Information</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We use the information we collect for the following purposes:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Service Delivery:</strong> To provide, maintain, and improve our AI-powered leasing automation platform</li>
                <li><strong>Lead Management:</strong> To process and manage leads on behalf of property managers, including qualification, scoring, and follow-up automation</li>
                <li><strong>AI Call Handling:</strong> To power our AI voice agents that answer calls, qualify prospects, and schedule showings</li>
                <li><strong>Automated Communications:</strong> To send automated calls, SMS, and emails with prior express consent</li>
                <li><strong>Analytics:</strong> To analyze usage patterns, identify trends, and improve our Service</li>
                <li><strong>Customer Support:</strong> To respond to inquiries and provide technical assistance</li>
                <li><strong>Security:</strong> To detect, prevent, and address fraud, abuse, and security issues</li>
                <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes</li>
              </ul>
            </section>

            {/* Section 4: Legal Basis for Processing */}
            <section id="legal-basis">
              <h2 className="text-xl font-semibold text-foreground mb-4">4. Legal Basis for Processing</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We process personal information under the following legal bases, as applicable under the 
                California Consumer Privacy Act (CCPA), Ohio Revised Code, and other applicable laws:
              </p>
              
              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">4.1 Contractual Necessity</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Processing necessary to perform our contract with you (e.g., providing the Service to 
                property managers, managing leads as instructed).
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">4.2 Legitimate Interests</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Processing necessary for our legitimate business interests, such as improving our Service, 
                preventing fraud, and ensuring network security, balanced against your rights and freedoms.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">4.3 Consent</h3>
              <p className="text-muted-foreground leading-relaxed">
                For automated communications (calls, SMS, emails), we obtain prior express written consent 
                as required by the Telephone Consumer Protection Act (TCPA) and applicable state laws. 
                You may withdraw consent at any time.
              </p>
            </section>

            {/* Section 5: Information Sharing */}
            <section id="information-sharing">
              <h2 className="text-xl font-semibold text-foreground mb-4">5. Information Sharing</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We share personal information only as described below:
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">5.1 Service Providers</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We engage trusted third-party service providers to perform functions on our behalf:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li><strong>Twilio:</strong> Telecommunications services for calls and SMS</li>
                <li><strong>OpenAI:</strong> AI processing for call analysis and lead scoring</li>
                <li><strong>Supabase:</strong> Cloud database and authentication services</li>
                <li><strong>Bland.ai:</strong> AI voice agent technology</li>
                <li><strong>Resend:</strong> Email delivery services</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mb-4">
                These providers are contractually obligated to protect your information and may only use 
                it as directed by us.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">5.2 Property Managers</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Lead data is shared with the property manager clients who are the data controllers for 
                their respective leads. We act as a data processor on their behalf.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">5.3 Legal Requirements</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We may disclose information when required by law, court order, or government request, 
                or to protect our rights, property, or safety.
              </p>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
                <p className="text-foreground font-semibold mb-2">We Do Not Sell Personal Information</p>
                <p className="text-muted-foreground text-sm">
                  Rent Finder Cleveland does not sell, rent, or trade personal information to third parties 
                  for their marketing purposes. We have not sold personal information in the preceding 
                  12 months and do not intend to do so.
                </p>
              </div>
            </section>

            {/* Section 6: SMS/Text Messaging */}
            <section id="sms-messaging">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. SMS/Text Messaging</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                By providing your phone number and opting in to receive SMS messages from Rent Finder Cleveland / HomeGuard,
                you consent to receive text messages related to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li>Property showing appointment confirmations and reminders</li>
                <li>Follow-up messages regarding your property inquiries</li>
                <li>Property availability notifications</li>
                <li>Application status updates</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">6.1 Message Frequency</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Message frequency varies based on your interactions with us. You may receive up to 10 messages
                per week during active property searches.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">6.2 Message and Data Rates</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                <strong>Message and data rates may apply.</strong> Check with your mobile carrier for details.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">6.3 Opt-Out</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You may opt out of receiving SMS messages at any time by replying <strong>STOP</strong> to any message.
                You may also reply <strong>STOPALL</strong>, <strong>UNSUBSCRIBE</strong>, <strong>CANCEL</strong>, <strong>END</strong>, or <strong>QUIT</strong>.
                After opting out, you will receive a confirmation message and will no longer receive SMS communications from us.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">6.4 Help</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For assistance, reply <strong>HELP</strong> to any message or contact us at (216) 238-3390
                or support@rentfindercleveland.com.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">6.5 Supported Carriers</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Compatible with most major US carriers including AT&T, Verizon, T-Mobile, Sprint, U.S. Cellular,
                Cricket, MetroPCS, Boost Mobile, and Virgin Mobile. Carriers are not responsible for delayed or undelivered messages.
              </p>
            </section>

            {/* Section 6b: TCPA Compliance */}
            <section id="tcpa-compliance">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. TCPA Compliance</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We are committed to full compliance with the Telephone Consumer Protection Act (TCPA),
                47 U.S.C. § 227, and its implementing regulations.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">7.1 Prior Express Written Consent</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                All automated calls and text messages sent through our platform require prior express
                written consent from the recipient. Consent is obtained through: (1) submitting a phone number
                on our website at rentfindercleveland.com with a clearly labeled consent checkbox, (2) verbal
                consent during phone calls, or (3) by texting START, YES, SUBSCRIBE, or INFO to (216) 238-3390.
                Consent is not a condition of purchase or service.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">7.2 Opt-Out Mechanisms</h3>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li>Reply STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT to any text message to immediately opt out</li>
                <li>Call (216) 238-3390 or email support@rentfindercleveland.com to request do-not-contact status</li>
                <li>Opt-out requests are processed immediately and honored within all systems</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">7.3 Call Recording Disclosures</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Phone calls with Rent Finder Cleveland / HomeGuard may be recorded for quality assurance and training purposes.
                You will be notified at the beginning of any recorded call. By continuing the call after this notification,
                you consent to the recording.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">7.4 Calling Hours</h3>
              <p className="text-muted-foreground leading-relaxed">
                Automated calls and texts are only sent during permitted hours (8:00 AM to 9:00 PM in
                the recipient's local time zone) unless the recipient has expressly consented to
                communications outside these hours.
              </p>
            </section>

            {/* Section 8: Fair Housing Act Compliance */}
            <section id="fair-housing">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. Fair Housing Act Compliance</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We are committed to compliance with the Fair Housing Act (42 U.S.C. §§ 3601-3619) and 
                Ohio's fair housing laws.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">8.1 Non-Discriminatory AI Systems</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Our AI systems, including lead scoring algorithms, do not use protected characteristics 
                (race, color, religion, national origin, sex, familial status, or disability) in any 
                decision-making processes.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">8.2 Behavioral Scoring Only</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Lead scores are based solely on behavioral and engagement signals, such as:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li>Response rate and communication engagement</li>
                <li>Showing attendance and follow-through</li>
                <li>Timeline urgency and move-in readiness</li>
                <li>Budget alignment with available properties</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">8.3 Regular Audits</h3>
              <p className="text-muted-foreground leading-relaxed">
                We conduct regular bias audits of our AI systems to identify and address any unintended 
                discriminatory patterns or disparate impact.
              </p>
            </section>

            {/* Section 9: Data Retention */}
            <section id="data-retention">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We retain personal information only as long as necessary for the purposes described 
                in this Privacy Policy:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Active Accounts:</strong> Account information is retained for the duration of the service relationship</li>
                <li><strong>Lead Data:</strong> Retained per the property manager's configuration (default: 180 days after last activity)</li>
                <li><strong>Call Recordings:</strong> 90 days unless legally required to retain longer</li>
                <li><strong>SMS/Communication Logs:</strong> 90 days for operational purposes</li>
                <li><strong>Consent Records:</strong> Retained for the duration of the relationship plus 5 years for compliance purposes</li>
                <li><strong>Financial Records:</strong> As required by applicable tax and accounting laws (typically 7 years)</li>
              </ul>
            </section>

            {/* Section 10: Your Rights */}
            <section id="your-rights">
              <h2 className="text-xl font-semibold text-foreground mb-4">10. Your Rights</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Under the California Consumer Privacy Act (CCPA), Ohio law, and other applicable regulations, 
                you have the following rights:
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.1 Right to Know</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You have the right to request disclosure of the categories and specific pieces of personal 
                information we have collected about you.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.2 Right to Access</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You have the right to request a copy of your personal information in a portable, 
                commonly used format.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.3 Right to Delete</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You have the right to request deletion of your personal information, subject to 
                certain exceptions (e.g., legal retention requirements).
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.4 Right to Correct</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You have the right to request correction of inaccurate personal information.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.5 Right to Opt-Out of Sale</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                While we do not sell personal information, you have the right to opt out of any 
                future sale should our practices change.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.6 Right to Non-Discrimination</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We will not discriminate against you for exercising any of your privacy rights.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.7 How to Exercise Your Rights</h3>
              <p className="text-muted-foreground leading-relaxed">
                To exercise any of these rights, please contact us using the information in Section 14. 
                We will verify your identity before processing your request and respond within 45 days 
                (or as required by applicable law).
              </p>
            </section>

            {/* Section 11: Data Security */}
            <section id="data-security">
              <h2 className="text-xl font-semibold text-foreground mb-4">11. Data Security</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We implement comprehensive security measures to protect your personal information:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                <li><strong>Encryption:</strong> All data is encrypted at rest and in transit using industry-standard protocols (TLS 1.3, AES-256)</li>
                <li><strong>Row-Level Security:</strong> Database access is controlled through row-level security policies ensuring users only access authorized data</li>
                <li><strong>Access Controls:</strong> Role-based access controls limit employee access to personal information on a need-to-know basis</li>
                <li><strong>Security Assessments:</strong> Regular vulnerability assessments and penetration testing</li>
                <li><strong>Incident Response:</strong> Documented incident response procedures for potential data breaches</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                While we strive to protect your information, no method of transmission over the Internet 
                or electronic storage is 100% secure. We are working toward SOC 2 Type II compliance 
                to demonstrate our commitment to security best practices.
              </p>
            </section>

            {/* Section 12: Children's Privacy */}
            <section id="childrens-privacy">
              <h2 className="text-xl font-semibold text-foreground mb-4">12. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our Service is not directed at children under the age of 13, and we do not knowingly 
                collect personal information from children under 13. If we learn that we have collected 
                personal information from a child under 13, we will promptly delete that information. 
                If you believe we have collected information from a child under 13, please contact us 
                immediately.
              </p>
            </section>

            {/* Section 13: Changes to This Policy */}
            <section id="policy-changes">
              <h2 className="text-xl font-semibold text-foreground mb-4">13. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We may update this Privacy Policy from time to time to reflect changes in our practices, 
                technology, legal requirements, or other factors. When we make material changes:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>We will update the "Effective Date" and "Last Updated" dates at the top of this page</li>
                <li>We will notify registered users by email at least 30 days before material changes take effect</li>
                <li>We will post a prominent notice on our website</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                Your continued use of the Service after the effective date of any changes constitutes 
                your acceptance of the updated Privacy Policy.
              </p>
            </section>

            {/* Section 14: Contact Information */}
            <section id="contact">
              <h2 className="text-xl font-semibold text-foreground mb-4">14. Contact Information</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                If you have questions about this Privacy Policy, wish to exercise your privacy rights, 
                or have concerns about our data practices, please contact us:
              </p>
              <div className="bg-muted/50 rounded-xl p-6">
                <p className="font-semibold text-foreground mb-2">Rent Finder Cleveland, LLC (HomeGuard)</p>
                <p className="text-muted-foreground">Cleveland, Ohio, United States</p>
                <p className="text-muted-foreground mt-4">
                  <strong>Phone:</strong>{" "}
                  <a href="tel:2162383390" className="text-primary hover:underline">(216) 238-3390</a>
                </p>
                <p className="text-muted-foreground">
                  <strong>Email:</strong>{" "}
                  <a href="mailto:support@rentfindercleveland.com" className="text-primary hover:underline">
                    support@rentfindercleveland.com
                  </a>
                </p>
                <p className="text-muted-foreground">
                  <strong>Website:</strong>{" "}
                  <a href="https://rentfindercleveland.com" className="text-primary hover:underline">
                    rentfindercleveland.com
                  </a>
                </p>
                <p className="text-muted-foreground mt-4 text-sm">
                  For privacy-related inquiries, we will respond within 10 business days. For rights
                  requests under CCPA or applicable law, we will respond within 45 days.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">Rent Finder Cleveland</span>
            </Link>
            
            <nav className="flex items-center gap-6 text-sm">
              <Link to="/p/privacy-policy" className="text-primary font-medium">
                Privacy Policy
              </Link>
              <Link to="/p/terms-of-service" className="text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <a href="tel:2162383390" className="text-muted-foreground hover:text-foreground transition-colors">
                Contact
              </a>
            </nav>
            
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Rent Finder Cleveland. All rights reserved.
            </p>
          </div>

          <p className="mt-8 text-xs text-muted-foreground/70 text-center max-w-4xl mx-auto leading-relaxed">
            Rent Finder Cleveland operates in compliance with federal and state regulations including 
            the Fair Housing Act, TCPA (Telephone Consumer Protection Act), CCPA (California Consumer 
            Privacy Act), and Ohio Revised Code. All automated communications require prior express 
            consent. Cleveland, Ohio, United States.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;
