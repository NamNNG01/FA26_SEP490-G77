#!/usr/bin/env bash
set -e

echo "=== ExamPrep Question Bank Test Runner ==="
echo "1. Resetting database..."
if [ -f "docs/postman/seed.sql" ]; then
    psql -U postgres -d examprep -f docs/postman/seed.sql
    echo "Database seeded successfully."
else
    echo "Warning: seed.sql not found."
fi

echo "2. Running Newman test suite..."
newman run docs/postman/question-bank.postman_collection.json \
  -e docs/postman/dev.postman_environment.json \
  --reporters cli,junit \
  --reporter-junit-export docs/postman/out/results.xml

echo "=== Test execution completed ==="
