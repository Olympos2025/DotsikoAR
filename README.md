# FieldAR

FieldAR είναι μία mobile-first web εφαρμογή επαυξημένης πραγματικότητας για την απεικόνιση γεωχωρικών δεδομένων (KML/KMZ) επάνω στο πραγματικό περιβάλλον. Βασίζεται σε Vite + TypeScript, A-Frame/AR.js, THREE.js, MapLibre GL και TailwindCSS.

## Χαρακτηριστικά

- Φόρτωση αρχείων KML/KMZ έως 5 MB, χωρίς αποστολή σε server.
- Προεπισκόπηση σε MapLibre GL map, επιλογή χρωμάτων/πάχους γραμμών, απλοποίηση γεωμετριών και ρύθμιση ετικετών.
- Location-based AR με A-Frame + AR.js, απόδοση πολυγώνων/γραμμών/σημείων σε τοπικό ENU σύστημα.
- UI overlay για ακρίβεια GPS, heading, ρυθμίσεις χειροκίνητης ευθυγράμμισης (nudge/heading offset) με αποθήκευση στο session.
- Ρυθμίσεις ορατότητας επιπέδων (σημεία/γραμμές/πολύγωνα) και ενημέρωση MapLibre/AR σε πραγματικό χρόνο.
- Ενσωματωμένη εξομάλυνση θέσης GPS (κινητός μέσος όρος 5 δειγμάτων) για μειωμένο jitter.
- Fallback 2D χάρτης με εμφάνιση χρήστη και δεδομένων όταν δεν υπάρχουν άδειες αισθητήρων ή δεν υπάρχει HTTPS.
- Πολυγλωσσικό UI (el/en), minimal Tailwind σχεδιασμός, light/dark theme.

## Ανάπτυξη

```bash
npm install
npm run dev
```

## Έλεγχος & build

```bash
npm run test
npm run build
```

Το build δημιουργεί τον φάκελο `dist/` έτοιμο για statically hosted περιβάλλον.

## Οδηγίες ανάπτυξης παραγωγής

1. Εγκαταστήστε εξαρτήσεις: `npm install`.
2. Δημιουργήστε παραγωγικό build: `npm run build`.
3. Ανεβάστε τον φάκελο `dist/` σε σύγχρονο static host (Netlify, Vercel, GitHub Pages, AWS S3 + CloudFront).
4. Βεβαιωθείτε ότι το domain σερβίρεται μέσω HTTPS (απαιτείται για κάμερα/αισθητήρες σε iOS & Android).
5. Ανοίξτε το URL σε mobile browser (iOS Safari 15+, Android Chrome) και δώστε άδειες κάμερας/τοποθεσίας/προσανατολισμού όταν ζητηθούν.

### Γρήγορη ανάπτυξη στο GitHub Pages

Το repository περιλαμβάνει workflow GitHub Actions (`.github/workflows/deploy.yml`) που δημιουργεί και δημοσιεύει αυτόματα το build στο GitHub Pages.

1. Μεταβείτε στις ρυθμίσεις του repository (Settings → Pages) και θέστε ως "Source" την επιλογή **GitHub Actions**.
2. Pushάρετε ή συγχωνεύστε αλλαγές στο branch `main` (ή εκτελέστε manual run του workflow μέσω **Actions → Deploy FieldAR to GitHub Pages → Run workflow**).
3. Η διαδικασία `Deploy FieldAR to GitHub Pages` θα τρέξει: εγκαθιστά εξαρτήσεις, εκτελεί `npm run build` και ανεβάζει τον φάκελο `dist/` ως artifact Pages.
4. Στο τέλος θα δημιουργηθεί/ενημερωθεί το περιβάλλον `github-pages` με το URL της εφαρμογής. Το link εμφανίζεται τόσο στη σελίδα του workflow όσο και στο panel Environments.
5. Επισκεφθείτε το παρεχόμενο HTTPS URL από mobile browser για να χρησιμοποιήσετε την εφαρμογή.

## Σημειώσεις

- Τα δικαιώματα ζητούνται μόνο μετά από user gesture («Έναρξη AR»).
- Η ακρίβεια εξαρτάται από consumer GPS (τυπικά ±10 m).
- Για δοκιμές συμπεριλαμβάνεται δείγμα KML στο repository (`thermi.kml`).
