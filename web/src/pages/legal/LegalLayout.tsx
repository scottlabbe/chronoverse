import { type PropsWithChildren, useEffect } from "react";
import { Link } from "react-router-dom";

export type LegalLayoutProps = PropsWithChildren<{
    title: string;
    description: string;
    lastUpdated: string;
}>;

export function LegalLayout({
    title,
    description,
    lastUpdated,
    children,
}: LegalLayoutProps) {
    useEffect(() => {
        if (typeof document !== "undefined") {
            document.title = `${title} | ChronoVerse`;
        }
    }, [title]);

    return (
        <div className="legal-page">
            <div className="legal-container">
                <header className="legal-header">
                    <div className="legal-breadcrumb">
                        <Link to="/" className="legal-back-link">
                            ChronoVerse home
                        </Link>
                        <span aria-hidden className="legal-breadcrumb-sep">
                            /
                        </span>
                        <span className="legal-breadcrumb-current">{title}</span>
                    </div>
                    <h1 id="legal-page-title">{title}</h1>
                    <p className="legal-description">{description}</p>
                    <p className="legal-updated">Last updated {lastUpdated}</p>
                </header>
                <main className="legal-main" aria-labelledby="legal-page-title">
                    {children}
                </main>
                <footer className="legal-footer">
                    <p>
                        Questions? Email the ChronoVerse team at {" "}
                        <a href="mailto:hello@chronoverse.app">hello@chronoverse.app</a>.
                    </p>
                </footer>
            </div>
        </div>
    );
}
