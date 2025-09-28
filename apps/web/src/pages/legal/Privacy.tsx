import { LegalLayout } from "./LegalLayout";

const LAST_UPDATED = "September 15, 2025";

const sections = [
    {
        id: "scope",
        title: "1. Scope",
        body: (
            <>
                <p>
                    This Privacy Policy explains how The Present Verse LLC ("The Present Verse",
                    "we", "us") collects, uses, shares, and safeguards information
                    when you visit our website, sign in to the app, or interact with
                    any related experiences (collectively, the "Services").
                </p>
                <p>
                    By using the Services you consent to the practices described in
                    this policy.
                </p>
            </>
        ),
    },
    {
        id: "information-we-collect",
        title: "2. Information We Collect",
        body: (
            <>
                <p>We collect the following categories of information:</p>
                <ul>
                    <li>
                        <strong>Account information:</strong> email address and
                        metadata supplied via Supabase authentication, such as the
                        time an account was created and sign-in events.
                    </li>
                    <li>
                        <strong>Usage information:</strong> interactions with the
                        interface, tone and theme selections, rate-limit consumption,
                        and generated output needed to render current and recent
                        poems.
                    </li>
                    <li>
                        <strong>Payment information:</strong> when subscriptions are
                        offered, Stripe payment processor collects billing
                        details. The Present Verse never stores your anything related to 
                        a payment card number.
                    </li>
                    <li>
                        <strong>Support communications:</strong> questions, feedback,
                        or survey responses that you send to the team.
                    </li>
                </ul>
            </>
        ),
    },
    {
        id: "how-we-use-information",
        title: "3. How We Use Information",
        body: (
            <>
                <p>We use collected information to:</p>
                <ul>
                    <li>Operate, maintain, and improve The Present Verse;</li>
                    <li>Detect, investigate, and prevent fraudulent or abusive
                        activity; and</li>
                </ul>
            </>
        ),
    },
    {
        id: "cookies",
        title: "4. Cookies and Similar Technologies",
        body: (
            <>
                <p>
                    We use cookies, local storage, and similar technologies to keep
                    you signed in, store your preferences, and understand engagement.
                    You can adjust your browser settings to refuse cookies, but some
                    features may not function correctly if cookies are disabled.
                </p>
            </>
        ),
    },
    {
        id: "data-retention",
        title: "5. Data Retention",
        body: (
            <>
                <p>
                    We retain personal information for as long as necessary to
                    provide the Services, comply with legal obligations, resolve
                    disputes, and enforce agreements. When data is no longer needed,
                    we will delete or anonymize it.
                </p>
            </>
        ),
    },
    {
        id: "security",
        title: "6. Security",
        body: (
            <>
                <p>
                    The Present Verse employs administrative, technical, and physical
                    safeguards designed to protect information from unauthorized
                    access, loss, misuse, or alteration. However, no system is
                    completely secure, and we cannot guarantee absolute security.
                </p>
            </>
        ),
    },
    {
        id: "changes",
        title: "7. Changes to this Policy",
        body: (
            <>
                <p>
                    We may update this Privacy Policy from time to time. If we make
                    material changes, we will provide notice, such as by updating the
                    "Last updated" date, sending an email, or posting an in-app
                    message. Continued use of the Services after the policy becomes
                    effective indicates acceptance of the changes.
                </p>
            </>
        ),
    },
    {
        id: "contact",
        title: "8. Contact Us",
        body: (
            <>
                <p>
                    For privacy questions or requests, email
                    {" "}
                    <a href="mailto:privacy@presentverse.app">privacy@presentverse.app</a>
                    {" "}
                    or write to The Present Verse LLC, 600 Stewart Street, Suite 400,
                    Seattle, WA 98101 USA.
                </p>
            </>
        ),
    },
];

export default function Privacy() {
    return (
        <LegalLayout
            title="Privacy Policy"
            description="Learn how The Present Verse collects, uses, and protects your information when you explore the minute-by-minute poetry stream."
            lastUpdated={LAST_UPDATED}
        >
            <nav aria-label="Privacy Policy sections" className="legal-toc">
                <h2>Quick reference</h2>
                <ul>
                    {sections.map((section) => (
                        <li key={section.id}>
                            <a href={`#${section.id}`}>{section.title}</a>
                        </li>
                    ))}
                </ul>
            </nav>
            {sections.map((section) => (
                <section key={section.id} id={section.id} className="legal-section">
                    <h2>{section.title}</h2>
                    {section.body}
                </section>
            ))}
        </LegalLayout>
    );
}
