import { LegalLayout } from "./LegalLayout";

const LAST_UPDATED = "April 26, 2024";

const sections = [
    {
        id: "overview",
        title: "1. Overview",
        body: (
            <>
                <p>
                    ChronoVerse is a creative writing experience that reveals a new
                    AI-generated stanza every minute.
                    (collectively, the "Services").
                </p>
                <p>
                    By accessing or using the Services you are agreeing to these
                    Terms of Service ("Terms"). If you are using the Services on
                    behalf of another person or organization, you confirm that you
                    have authority to bind them to these Terms.
                </p>
            </>
        ),
    },
    {
        id: "eligibility",
        title: "2. Eligibility and Accounts",
        body: (
            <>
                <p>
                    We may suspend or terminate access if we believe you have
                    violated these Terms or if your use poses a risk to us or to
                    other members of the community.
                </p>
            </>
        ),
    },
    {
        id: "subscriptions",
        title: "3. Subscriptions and Billing",
        body: (
            <>
                <p>
                    ChronoVerse currently offers a limited free exploration window
                    and anticipates paid subscriptions to unlock uninterrupted
                    access. Pricing and features will be described at the time of
                    purchase. When subscriptions become available you authorize us
                    and our payment processor to charge the payment method you
                    provide for recurring fees, taxes, and any applicable charges.
                </p>
                <p>
                    Unless otherwise stated, subscription plans renew automatically
                    until you cancel. You may cancel at any time and will retain
                    access through the end of the current billing period. We do not
                    offer refunds except where required by law.
                </p>
            </>
        ),
    },
    {
        id: "acceptable-use",
        title: "4. Acceptable Use",
        body: (
            <>
                <p>
                    You agree not to misuse the Services. This includes, without
                    limitation:
                </p>
                <ul>
                    <li>Attempting to bypass rate limits or access controls;</li>
                    <li>Reverse engineering, scraping, or harvesting data outside of
                    normal product features;</li>
                    <li>Generating harmful, infringing, or unlawful content, or
                    sharing ChronoVerse output in a misleading way;</li>
                    <li>Uploading or transmitting viruses, malware, or other harmful
                    code; and</li>
                    <li>Using the Services for any commercial purpose not expressly
                    permitted in writing by ChronoVerse.</li>
                </ul>
                <p>
                    We reserve the right to remove content, throttle usage, or
                    terminate access if we believe these guidelines are violated.
                </p>
            </>
        ),
    },
    {
        id: "content",
        title: "5. Content Ownership and Licenses",
        body: (
            <>
                <p>
                    ChronoVerse retains ownership of the Services, including the
                    interface, generated poetry, brand assets, and underlying
                    technology. Subject to these Terms we grant you a limited,
                    non-transferable license to use the Services for your personal,
                    non-commercial enjoyment.
                </p>
            </>
        ),
    },
    {
        id: "ai-content",
        title: "6. Generated Output",
        body: (
            <>
                <p>
                    ChronoVerse creates poems and prompts with the help of machine
                    learning models. Generated output may occasionally be inaccurate,
                    offensive, or unexpected. You are responsible for reviewing and
                    using any ChronoVerse output responsibly and in accordance with
                    applicable laws.
                </p>
                <p>
                    We may analyze aggregated usage data and prompts, in accordance
                    with our Privacy Policy, to improve poem quality, guard against
                    abuse, and maintain the experience.
                </p>
            </>
        ),
    },
    {
        id: "feedback",
        title: "7. Feedback",
        body: (
            <>
                <p>
                    If you choose to share feedback, suggestions, or ideas with us,
                    you grant ChronoVerse a perpetual, irrevocable license to use the
                    feedback without restriction or obligation to you.
                </p>
            </>
        ),
    },
    {
        id: "third-parties",
        title: "8. Third-Party Services",
        body: (
            <>
                <p>
                    The Services may rely on third-party providers such as Supabase
                    for authentication and payment processors for billing. Your use
                    of those services may be subject to additional terms and privacy
                    policies provided by the third parties.
                </p>
            </>
        ),
    },
    {
        id: "disclaimers",
        title: "9. Disclaimers",
        body: (
            <>
                <p>
                    ChronoVerse is provided "as is" and "as available" without
                    warranties of any kind, whether express or implied, including
                    implied warranties of merchantability, fitness for a particular
                    purpose, title, and non-infringement. We do not guarantee that
                    the Services will be uninterrupted, error-free, or secure.
                </p>
            </>
        ),
    },
    {
        id: "liability",
        title: "10. Limitation of Liability",
        body: (
            <>
                <p>
                    To the fullest extent permitted by law, ChronoVerse and its
                    team will not be liable for any indirect, incidental,
                    consequential, special, or exemplary damages arising out of or in
                    connection with the Services, even if advised of the possibility
                    of such damages. Our total liability for any claim arising from
                    these Terms or the Services will not exceed the greater of $50 or
                    the amount you paid to ChronoVerse in the twelve months before
                    the claim arose.
                </p>
            </>
        ),
    },
    {
        id: "indemnity",
        title: "11. Indemnification",
        body: (
            <>
                <p>
                    You agree to indemnify and hold ChronoVerse and its affiliates
                    harmless from any claims, damages, liabilities, and expenses
                    (including reasonable legal fees) arising from your use of the
                    Services, your content, or your breach of these Terms.
                </p>
            </>
        ),
    },
    {
        id: "termination",
        title: "12. Termination",
        body: (
            <>
                <p>
                    We may suspend or end the Services at any time with or without
                    notice. You may stop using the Services at any time. Upon
                    termination, the licenses granted to you under these Terms will
                    end and you must cease using the Services.
                </p>
            </>
        ),
    },
    {
        id: "governing-law",
        title: "13. Governing Law",
        body: (
            <>
                <p>
                    These Terms are governed by the laws of the State of Washington,
                    without regard to its conflicts of law principles. Any disputes
                    will be resolved in the state or federal courts located in King
                    County, Washington, and the parties consent to personal
                    jurisdiction in those courts.
                </p>
            </>
        ),
    },
    {
        id: "changes",
        title: "14. Changes to These Terms",
        body: (
            <>
                <p>
                    We may update these Terms from time to time. If we make material
                    changes we will provide reasonable notice, such as by updating
                    the "Last updated" date, sending an email, or posting an alert in
                    the product. Your continued use of ChronoVerse after changes take
                    effect constitutes acceptance of the revised Terms.
                </p>
            </>
        ),
    },
    {
        id: "contact",
        title: "15. Contact",
        body: (
            <>
                <p>
                    For questions about these Terms, please email
                    {" "}
                    <a href="mailto:hello@chronoverse.app">hello@chronoverse.app</a>.
                </p>
            </>
        ),
    },
];

export default function Terms() {
    return (
        <LegalLayout
            title="Terms of Service"
            description="These terms explain how you may use the ChronoVerse experience and what you can expect from us."
            lastUpdated={LAST_UPDATED}
        >
            <nav aria-label="Terms of Service sections" className="legal-toc">
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
