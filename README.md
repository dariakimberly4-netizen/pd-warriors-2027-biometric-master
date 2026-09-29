# PD Warriors 2027 — Biometric Master Database

Standalone prototype for the Parkinson's Disease Warriors Philippines Get Together 2027 registration workflow.

## Included flow
- Participant registration at home
- Device biometric / pass activation workflow
- Permanent participant QR-style event pass
- Registration as the Master Database
- Staff station copies for Check-In, Snack, Lunch, and Raffle
- Companion raffle restriction
- Offline local transaction storage
- Master sync simulation
- Final event report download

## Privacy design
The event database must not store fingerprint images, facial images, or biometric templates. Biometric verification stays on the participant's own device; the system records verification status/credential references only.

## Deployment note
This GitHub Pages build is the browser/PWA prototype. True Android Nearby Connections phone-to-phone database sync requires a native Android implementation.

Open `index.html` as the main app.
