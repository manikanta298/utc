#!/bin/bash
# Run this after regenerating your GitHub token
# Usage: ./PUSH_FIXES.sh ghp_YOUR_NEW_TOKEN

TOKEN=$1
if [ -z "$TOKEN" ]; then
  echo "Usage: ./PUSH_FIXES.sh ghp_YOUR_NEW_TOKEN"
  exit 1
fi

git remote set-url origin "https://manikanta298:${TOKEN}@github.com/manikanta298/utc-cafe.git"
git push -f origin main
echo "Done! Deploy your backend and frontend."
