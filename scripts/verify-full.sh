#!/usr/bin/env bash

set -euo pipefail

npm run verify:static
npm run verify:checks
concurrently --group --names 'coverage,unit' 'npm:verify:coverage' 'npm:verify:unit'
concurrently --group --names 'e2e,security' 'npm:e2e:full' 'npm:verify:security'
