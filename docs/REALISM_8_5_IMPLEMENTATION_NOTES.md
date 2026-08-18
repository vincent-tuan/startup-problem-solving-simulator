# Realism 8.5 implementation notes

Scenario 2.1.x introduces anti-exploit operating physics while preserving 2.0.x compatibility.

The implementation is intentionally deterministic: eligibility and probability remain hidden from the client, while sampled outcomes are stored on scheduled effects. The UI should expose observable states—application, offer, facility, due, late, disputed, written off—rather than exact probabilities or engine recommendations.

The release is considered incomplete if a user can repeatedly obtain unbounded cash, accounts, or collections by replaying a command without consuming a finite pool or accepting a corresponding obligation and downside.
