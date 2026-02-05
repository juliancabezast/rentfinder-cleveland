 import React, { useEffect } from "react";
 import { Link } from "react-router-dom";
 import { Building2, ArrowLeft } from "lucide-react";
 import { Button } from "@/components/ui/button";
 
 const SECTIONS = [
   { id: "agreement", title: "1. Agreement to Terms" },
   { id: "service-description", title: "2. Description of Service" },
   { id: "eligibility", title: "3. Eligibility" },
   { id: "account-registration", title: "4. Account Registration" },
   { id: "subscription-billing", title: "5. Subscription Plans & Billing" },
   { id: "acceptable-use", title: "6. Acceptable Use Policy" },
   { id: "data-ownership", title: "7. Data Ownership" },
   { id: "ai-services", title: "8. AI and Automated Services" },
   { id: "third-party", title: "9. Third-Party Integrations" },
   { id: "liability", title: "10. Limitation of Liability" },
   { id: "indemnification", title: "11. Indemnification" },
   { id: "intellectual-property", title: "12. Intellectual Property" },
   { id: "termination", title: "13. Termination" },
   { id: "governing-law", title: "14. Governing Law" },
   { id: "severability", title: "15. Severability" },
   { id: "contact", title: "16. Contact Information" },
 ];
 
 const TermsOfService: React.FC = () => {
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
           <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
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
             {/* Section 1: Agreement to Terms */}
             <section id="agreement">
               <h2 className="text-xl font-semibold text-foreground mb-4">1. Agreement to Terms</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 By accessing or using Rent Finder Cleveland's website at rentfindercleveland.com, our 
                 AI-powered leasing automation platform, or any related services (collectively, the "Service"), 
                 you agree to be bound by these Terms of Service ("Terms"). These Terms constitute a legally 
                 binding agreement between you and Rent Finder Cleveland LLC ("Company," "we," "us," or "our").
               </p>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 If you are entering into these Terms on behalf of a company or other legal entity, you 
                 represent that you have the authority to bind such entity to these Terms, in which case 
                 "you" or "your" shall refer to such entity.
               </p>
               <p className="text-muted-foreground leading-relaxed">
                 If you do not agree to these Terms, you must not access or use the Service.
               </p>
             </section>
 
             {/* Section 2: Description of Service */}
             <section id="service-description">
               <h2 className="text-xl font-semibold text-foreground mb-4">2. Description of Service</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 Rent Finder Cleveland provides an AI-powered leasing automation platform designed for 
                 property managers and property owners. Our Service includes:
               </p>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                 <li><strong>AI Voice Agents:</strong> Automated phone agents that answer calls, qualify leads, and schedule showings 24/7</li>
                 <li><strong>Lead Management:</strong> Capture, scoring, and tracking of rental prospects</li>
                 <li><strong>Automated Communications:</strong> SMS, email, and voice follow-ups with consent management</li>
                 <li><strong>Showing Scheduling:</strong> Automated booking, confirmations, and reminders</li>
                 <li><strong>Analytics & Reporting:</strong> Dashboards and insights on lead performance and conversion</li>
                 <li><strong>Section 8 Tracking:</strong> Voucher verification and housing authority management</li>
                 <li><strong>Third-Party Integrations:</strong> Connections with property management software</li>
               </ul>
               <p className="text-muted-foreground leading-relaxed">
                 We reserve the right to modify, suspend, or discontinue any aspect of the Service at any 
                 time with reasonable notice to active subscribers.
               </p>
             </section>
 
             {/* Section 3: Eligibility */}
             <section id="eligibility">
               <h2 className="text-xl font-semibold text-foreground mb-4">3. Eligibility</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 To use the Service, you must:
               </p>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                 <li>Be at least 18 years of age</li>
                 <li>Be an authorized representative of a property management company, real estate company, or property owner</li>
                 <li>Have the legal authority to enter into binding contracts</li>
                 <li>Not be prohibited from using the Service under applicable laws</li>
                 <li>Comply with all applicable federal, state, and local laws regarding property rental and fair housing</li>
               </ul>
             </section>
 
             {/* Section 4: Account Registration */}
             <section id="account-registration">
               <h2 className="text-xl font-semibold text-foreground mb-4">4. Account Registration</h2>
               
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">4.1 Accurate Information</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You agree to provide accurate, current, and complete information during registration and 
                 to update such information as necessary to maintain its accuracy.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">4.2 Account Security</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You are responsible for maintaining the confidentiality of your account credentials and 
                 for all activities that occur under your account. You must notify us immediately of any 
                 unauthorized access or security breach.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">4.3 One Account Per Organization</h3>
               <p className="text-muted-foreground leading-relaxed">
                 Each organization may maintain only one account. Multiple user access within an organization 
                 is managed through our user invitation system.
               </p>
             </section>
 
             {/* Section 5: Subscription Plans & Billing */}
             <section id="subscription-billing">
               <h2 className="text-xl font-semibold text-foreground mb-4">5. Subscription Plans & Billing</h2>
               
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">5.1 Free Trial</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 We offer a 14-day free trial with no credit card required. During the trial period, you 
                 will have access to the Service features as specified for your selected plan. At the end 
                 of the trial, your account will be suspended unless you subscribe to a paid plan.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">5.2 Paid Plans</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 Paid subscriptions are available on monthly or annual billing cycles. Plans are based on 
                 portfolio size and feature requirements:
               </p>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                 <li><strong>Starter:</strong> Up to 10 properties</li>
                 <li><strong>Professional:</strong> Up to 50 properties</li>
                 <li><strong>Enterprise:</strong> Unlimited properties with custom integrations</li>
               </ul>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">5.3 Auto-Renewal</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 Subscriptions automatically renew at the end of each billing period unless cancelled. 
                 We will charge the payment method on file at the then-current rate.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">5.4 Cancellation</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You may cancel your subscription at any time through your account settings. Cancellation 
                 takes effect at the end of the current billing period. You will retain access to the 
                 Service until the end of the paid period.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">5.5 Refund Policy</h3>
               <p className="text-muted-foreground leading-relaxed">
                 Annual plans are eligible for a pro-rata refund if cancelled within 30 days of purchase 
                 or renewal. Monthly plans are non-refundable but will not renew after cancellation.
               </p>
             </section>
 
             {/* Section 6: Acceptable Use Policy */}
             <section id="acceptable-use">
               <h2 className="text-xl font-semibold text-foreground mb-4">6. Acceptable Use Policy</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You agree to use the Service only for lawful purposes and in accordance with these Terms. 
                 You must NOT:
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">6.1 Fair Housing Compliance</h3>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                 <li>Use the Service in any manner that violates the Fair Housing Act (42 U.S.C. §§ 3601-3619)</li>
                 <li>Use lead scoring or filtering to discriminate based on race, color, religion, national origin, sex, familial status, or disability</li>
                 <li>Create property listings or communications that express discriminatory preferences</li>
               </ul>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">6.2 TCPA Compliance</h3>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                 <li>Send automated calls or texts without obtaining proper prior express written consent</li>
                 <li>Ignore opt-out requests or STOP keywords</li>
                 <li>Make automated calls outside of permitted hours (8 AM - 9 PM local time)</li>
                 <li>Use the Service to contact numbers on the National Do Not Call Registry without consent</li>
               </ul>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">6.3 Technical Restrictions</h3>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                 <li>Attempt to reverse-engineer, decompile, or extract our AI models or algorithms</li>
                 <li>Store credentials for third-party services outside the platform's secure credential storage</li>
                 <li>Use automated scripts or bots to access the Service without authorization</li>
                 <li>Attempt to circumvent security measures or access controls</li>
                 <li>Interfere with or disrupt the Service or servers</li>
               </ul>
             </section>
 
             {/* Section 7: Data Ownership */}
             <section id="data-ownership">
               <h2 className="text-xl font-semibold text-foreground mb-4">7. Data Ownership</h2>
               
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">7.1 Your Data</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You retain all ownership rights to the data you upload, create, or receive through the 
                 Service ("Customer Data"), including lead information, property listings, and communication 
                 records. We do not claim ownership of your Customer Data.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">7.2 License to Process</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You grant us a limited, non-exclusive license to use, process, and display Customer Data 
                 solely for the purpose of providing and improving the Service. This license includes the 
                 right to use aggregated, anonymized data for analytics and product development.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">7.3 Data Export</h3>
               <p className="text-muted-foreground leading-relaxed">
                 Upon termination of your account, you will have 30 days to export your Customer Data. 
                 We provide data export tools in CSV format. After 30 days, we may delete your data in 
                 accordance with our data retention policies.
               </p>
             </section>
 
             {/* Section 8: AI and Automated Services */}
             <section id="ai-services">
               <h2 className="text-xl font-semibold text-foreground mb-4">8. AI and Automated Services</h2>
               
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">8.1 AI Agent Authority</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 Our AI voice agents and automated systems act on your behalf when interacting with 
                 prospects. By using these features, you authorize the AI to answer calls, provide 
                 property information, qualify leads, and schedule showings according to your configuration.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">8.2 Accuracy of Information</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You are responsible for ensuring the accuracy of property information, pricing, 
                 availability, and other details that AI agents communicate to prospects. We are not 
                 liable for errors resulting from inaccurate information you provide.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">8.3 AI Limitations</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 AI-generated insights, recommendations, and lead scores are provided for informational 
                 purposes only and do not constitute legal, financial, or professional advice. You should 
                 exercise independent judgment in all business decisions.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">8.4 Recording Compliance</h3>
               <p className="text-muted-foreground leading-relaxed">
                 While our system provides recording disclosures in compliance with federal law, you are 
                 responsible for understanding and complying with any additional recording consent 
                 requirements in your jurisdiction and the jurisdictions of your prospects.
               </p>
             </section>
 
             {/* Section 9: Third-Party Integrations */}
             <section id="third-party">
               <h2 className="text-xl font-semibold text-foreground mb-4">9. Third-Party Integrations</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 The Service integrates with third-party services to provide functionality:
               </p>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                 <li><strong>Twilio:</strong> Voice and SMS communications</li>
                 <li><strong>Bland.ai:</strong> AI voice agent technology</li>
                 <li><strong>OpenAI:</strong> Natural language processing and analysis</li>
                 <li><strong>Doorloop:</strong> Property management software integration</li>
                 <li><strong>Resend:</strong> Email delivery</li>
               </ul>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 Your use of these integrations is subject to the respective third-party terms of service. 
                 We are not responsible for the availability, security, or performance of third-party services.
               </p>
               <p className="text-muted-foreground leading-relaxed">
                 We are not liable for any service interruptions, data loss, or other issues caused by 
                 third-party service outages or changes.
               </p>
             </section>
 
             {/* Section 10: Limitation of Liability */}
             <section id="liability">
               <h2 className="text-xl font-semibold text-foreground mb-4">10. Limitation of Liability</h2>
               
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.1 Service "As Is"</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, 
                 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, 
                 FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.2 No Liability For</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 We are not liable for:
               </p>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                 <li>Missed leads due to system issues, call failures, or prospect behavior</li>
                 <li>Failed calls or communications due to carrier issues or network problems</li>
                 <li>AI errors, misunderstandings, or inappropriate responses</li>
                 <li>Lost business opportunities or vacancy costs</li>
                 <li>TCPA violations resulting from your failure to obtain proper consent</li>
                 <li>Fair Housing violations resulting from your configuration or instructions</li>
               </ul>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">10.3 Maximum Liability</h3>
               <p className="text-muted-foreground leading-relaxed">
                 TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING OUT 
                 OF OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE TOTAL FEES PAID BY YOU 
                 TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
               </p>
             </section>
 
             {/* Section 11: Indemnification */}
             <section id="indemnification">
               <h2 className="text-xl font-semibold text-foreground mb-4">11. Indemnification</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You agree to indemnify, defend, and hold harmless Rent Finder Cleveland LLC, its officers, 
                 directors, employees, and agents from and against any claims, liabilities, damages, losses, 
                 and expenses (including reasonable attorneys' fees) arising out of or related to:
               </p>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                 <li>Your violation of these Terms</li>
                 <li>Your violation of the Fair Housing Act or other fair housing laws</li>
                 <li>Your violation of the TCPA or other telecommunications laws</li>
                 <li>Your failure to obtain proper consent for automated communications</li>
                 <li>Claims by leads, tenants, or prospects related to your use of the Service</li>
                 <li>Your misuse of the Service or violation of applicable laws</li>
               </ul>
             </section>
 
             {/* Section 12: Intellectual Property */}
             <section id="intellectual-property">
               <h2 className="text-xl font-semibold text-foreground mb-4">12. Intellectual Property</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 The Service, including the platform, AI models, algorithms, software, documentation, 
                 user interface, and all related intellectual property, is and remains the exclusive 
                 property of Rent Finder Cleveland LLC.
               </p>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 We grant you a limited, non-exclusive, non-transferable license to use the Service 
                 during your subscription term solely for your internal business purposes in accordance 
                 with these Terms.
               </p>
               <p className="text-muted-foreground leading-relaxed">
                 You may not copy, modify, distribute, sell, or lease any part of the Service, nor may 
                 you reverse-engineer or attempt to extract the source code of any software.
               </p>
             </section>
 
             {/* Section 13: Termination */}
             <section id="termination">
               <h2 className="text-xl font-semibold text-foreground mb-4">13. Termination</h2>
               
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">13.1 Termination by You</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 You may terminate your account at any time by providing 30 days written notice or by 
                 using the cancellation feature in your account settings.
               </p>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">13.2 Termination by Us</h3>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 We may terminate or suspend your account with 30 days notice for any reason. We may 
                 terminate immediately without notice for:
               </p>
               <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
                 <li>Material breach of these Terms</li>
                 <li>Violation of the Fair Housing Act or TCPA</li>
                 <li>Fraudulent or illegal activity</li>
                 <li>Non-payment of fees after notice and opportunity to cure</li>
               </ul>
 
               <h3 className="text-lg font-medium text-foreground mt-6 mb-3">13.3 Effect of Termination</h3>
               <p className="text-muted-foreground leading-relaxed">
                 Upon termination, your right to use the Service immediately ceases. Provisions that by 
                 their nature should survive termination (including indemnification, limitation of liability, 
                 and intellectual property) shall survive.
               </p>
             </section>
 
             {/* Section 14: Governing Law */}
             <section id="governing-law">
               <h2 className="text-xl font-semibold text-foreground mb-4">14. Governing Law</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 These Terms shall be governed by and construed in accordance with the laws of the State 
                 of Ohio, United States, without regard to its conflict of law provisions.
               </p>
               <p className="text-muted-foreground leading-relaxed">
                 Any disputes arising out of or relating to these Terms or the Service shall be resolved 
                 exclusively in the state or federal courts located in Cuyahoga County, Ohio. You consent 
                 to the personal jurisdiction of such courts.
               </p>
             </section>
 
             {/* Section 15: Severability */}
             <section id="severability">
               <h2 className="text-xl font-semibold text-foreground mb-4">15. Severability</h2>
               <p className="text-muted-foreground leading-relaxed">
                 If any provision of these Terms is held to be unenforceable or invalid by a court of 
                 competent jurisdiction, such provision shall be modified to the minimum extent necessary 
                 to make it enforceable, and the remaining provisions of these Terms shall remain in full 
                 force and effect.
               </p>
             </section>
 
             {/* Section 16: Contact Information */}
             <section id="contact">
               <h2 className="text-xl font-semibold text-foreground mb-4">16. Contact Information</h2>
               <p className="text-muted-foreground leading-relaxed mb-4">
                 If you have questions about these Terms of Service or need to contact us for any reason, 
                 please reach out:
               </p>
               <div className="bg-muted/50 rounded-xl p-6">
                 <p className="font-semibold text-foreground mb-2">Rent Finder Cleveland LLC</p>
                 <p className="text-muted-foreground">Cleveland, Ohio, United States</p>
                 <p className="text-muted-foreground mt-4">
                   <strong>Phone:</strong>{" "}
                   <a href="tel:2166308857" className="text-primary hover:underline">(216) 630-8857</a>
                 </p>
                 <p className="text-muted-foreground">
                   <strong>Email:</strong>{" "}
                   <a href="mailto:legal@rentfindercleveland.com" className="text-primary hover:underline">
                     legal@rentfindercleveland.com
                   </a>
                 </p>
                 <p className="text-muted-foreground mt-4 text-sm">
                   For legal inquiries, we will respond within 10 business days.
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
               <Link to="/p/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors">
                 Privacy Policy
               </Link>
               <Link to="/p/terms-of-service" className="text-primary font-medium">
                 Terms of Service
               </Link>
               <a href="tel:2166308857" className="text-muted-foreground hover:text-foreground transition-colors">
                 Contact
               </a>
             </nav>
             
             <p className="text-sm text-muted-foreground">
               © {new Date().getFullYear()} Rent Finder Cleveland. All rights reserved.
             </p>
           </div>
 
           <p className="mt-8 text-xs text-muted-foreground/70 text-center max-w-4xl mx-auto leading-relaxed">
             Rent Finder Cleveland operates in compliance with federal and state regulations including 
             the Fair Housing Act, TCPA (Telephone Consumer Protection Act), and Ohio Revised Code. 
             All automated communications require prior express consent. Cleveland, Ohio, United States.
           </p>
         </div>
       </footer>
     </div>
   );
 };
 
 export default TermsOfService;