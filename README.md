# FieldAR

FieldAR είναι μια mobile-first web εφαρμογή επαυξημένης πραγματικότητας που φορτώνει αρχεία KML/KMZ και τα αποδίδει στο φυσικό
περιβάλλον γύρω από τον χρήστη. Η στοίβα βασίζεται σε Vite + TypeScript, A-Frame/AR.js, THREE.js, MapLibre GL, TailwindCSS και
τρέχει αποκλειστικά στον browser χωρίς backend.

## Χαρακτηριστικά

- Φόρτωση KML/KMZ (έως ~5 MB) αποκλειστικά client-side με `@tmcw/togeojson` + `jszip`.
- MapLibre GL mini-map για προεπισκόπηση, επιλογή styling (χρώμα, opacity, πάχος γραμμών, εικονίδιο σημείων) και έλεγχο ορατότητας layers.
- AR overlay με A-Frame/AR.js (gps-camera) και THREE.js για σημεία (billboards), γραμμές και πολύγωνα (fill + outline).
- Μετατροπή γεωμετρίας σε τοπικό ENU με `geodesy`, εξομάλυνση GPS (moving average), χειροκίνητο nudge + heading fine-tune με αποθήκευση ανά session.
- UI overlay με ακρίβεια GPS, heading indicator, slider διαφάνειας, ύψος offset, απλοποίηση Douglas-Peucker και highlight λίστας features.
- Fallback map mode όταν δεν υπάρχουν άδειες αισθητήρων ή HTTPS.
- Πολυγλωσσικό UI (el/en) με αυτόματο light/dark theme.

## Εγκατάσταση & Ανάπτυξη

```bash
npm install
npm run dev
```

Το development server τρέχει σε `http://localhost:5173`. Για πρόσβαση σε κάμερα/αισθητήρες απαιτείται HTTPS ακόμη και τοπικά (χρησιμοποιήστε
π.χ. `vite --host` πίσω από dev proxy ή `mkcert`).

## Έλεγχος & Build

```bash
npm run test
npm run build
```

Το build παράγει τον φάκελο `dist/` με όλα τα αρχεία για static hosting.

## Νέο repository & GitHub Pages

1. Δημιουργήστε νέο GitHub repository, π.χ. **fieldar-web** (ή άλλο όνομα της επιλογής σας).
2. Pushάρετε όλα τα αρχεία του project στο branch `main` του νέου repository.
3. Στις ρυθμίσεις του repository (Settings → Pages) ορίστε ως Source το **GitHub Actions**.
4. Το repository περιλαμβάνει το workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) που, σε κάθε push στο `main`,
   εκτελεί `npm run build` και δημοσιεύει τα περιεχόμενα του `dist/` στο GitHub Pages.
5. Μετά την ολοκλήρωση του workflow, το site θα είναι διαθέσιμο στην διεύθυνση:

   ```
   https://<το-github-username-σας>.github.io/fieldar-web/
   ```

   Αν επιλέξετε διαφορετικό όνομα repository, αντικαταστήστε ανάλογα το `fieldar-web`.

## Προαπαιτούμενα πλοήγησης

- Υποχρεωτικό HTTPS για κάμερα/γεωεντοπισμό σε iOS (Safari 15+) και Android (Chrome).
- Οι άδειες ζητούνται μόνο μετά το κουμπί «Έναρξη AR».
- Εμφανίζεται ενημερωτικό modal όταν η εφαρμογή τρέχει εκτός ασφαλούς προέλευσης.

## Δείγμα δεδομένων

Το repository περιλαμβάνει το δείγμα [`thermi.kml`](thermi.kml) για άμεση δοκιμή φόρτωσης γεωμετρίας.

## Άδειες & Απόρρητο

- Τα δεδομένα μένουν τοπικά στον browser (δεν γίνεται upload).
- Παρέχεται κουμπί "Ευθυγράμμιση" για χειροκίνητη ρύθμιση θέσης/heading και αποθήκευση στο session storage.

Καλή εξερεύνηση με το FieldAR!
