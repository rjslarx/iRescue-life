#!/bin/bash

echo "Starting deployment build..."

echo "Building application..."
npm run build
BUILD_RESULT=$?

if [ $BUILD_RESULT -ne 0 ]; then
  echo "Build failed!"
  exit 1
fi

echo "Deployment build complete!"
exit 0
