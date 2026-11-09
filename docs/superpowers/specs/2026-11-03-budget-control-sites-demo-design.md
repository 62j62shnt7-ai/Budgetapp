# Budget Control Sites Demo Design

## Intent

Create a private, clickable Sites demo that helps the owner picture Budget Control v2 as a polished web app. It should borrow the app's existing dark theme, Budget Control identity, and Dashboard / Deficits / Cash Flow / History / Accounts / Storage / Jobs / Rates navigation.

## Goals and boundaries

- Show a responsive dashboard and switchable section views with believable, clearly fictional sample figures.
- Reflect the app's financial concepts (cash, net worth, forecast, upcoming card dues, health, and recent activity) without implying the demo is connected to production data.
- Keep it as a presentation prototype; no account sign-in, persistence, or live financial actions.
- Do not modify the existing Budgetapp source files.

## Approaches

- Static screenshot-style page: quickest, but cannot demonstrate navigation.
- Clickable single-page demo in Sites: lets the owner explore sections while keeping setup lightweight. **Recommended and selected**, matching the request for a clickable demo adapted to the app.
- Full port of the React application: closest feature parity, but out of scope for a visual preview and requires real data / persistence decisions.

## Design and implementation

Build a responsive, buildless HTML/CSS/JS Site in a separate Sites source folder. Use the current dark palette, indigo accents, compact left navigation, and dashboard metrics. Navigation changes the active section and its content; sample data is explicitly marked as demo data. Publish as a new private Site and open it for review.

## Builder calls

Use sample EGP amounts, static illustrative chart data, and simple section summaries as safe defaults. Use the existing app's labels and visual language where evident from its source.
