#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "[FieldAR] Απαιτείται το GitHub CLI (gh). Εγκαταστήστε το: https://cli.github.com/" >&2
  exit 1
fi

if [ $# -lt 2 ]; then
  echo "Χρήση: $0 <github-username> <repository-name> [visibility]" >&2
  echo "Παράδειγμα: $0 your-user fieldar-web public" >&2
  exit 1
fi

GITHUB_USER="$1"
REPO_NAME="$2"
VISIBILITY="${3:-public}"

REPO_FULL_NAME="$GITHUB_USER/$REPO_NAME"

if gh repo view "$REPO_FULL_NAME" >/dev/null 2>&1; then
  echo "Το repository $REPO_FULL_NAME υπάρχει ήδη. Παράλειψη δημιουργίας." >&2
else
  echo "Δημιουργία repository $REPO_FULL_NAME..."
  gh repo create "$REPO_FULL_NAME" --$VISIBILITY --description "FieldAR WebAR viewer" --confirm
fi

echo "Push τοπικών αρχείων..."
# Βεβαιωθείτε ότι το git remote 'origin' αντιστοιχεί στο νέο repository.
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/$REPO_FULL_NAME.git"
else
  git remote add origin "https://github.com/$REPO_FULL_NAME.git"
fi

git branch -M main
git push -u origin main

echo "Ενεργοποίηση GitHub Pages μέσω workflow..."
if gh workflow view deploy >/dev/null 2>&1; then
  gh workflow enable deploy
fi

echo "Δημοσίευση ολοκληρώθηκε. Η εφαρμογή θα είναι διαθέσιμη μετά την ολοκλήρωση του workflow στο:"
echo "https://$GITHUB_USER.github.io/$REPO_NAME/"
