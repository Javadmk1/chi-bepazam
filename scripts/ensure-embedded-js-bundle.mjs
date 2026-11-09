const fs = require('node:fs');

const gradlePath = 'android/app/build.gradle';
let source = fs.readFileSync(gradlePath, 'utf8');
const reactBlock = /react\s*\{/m;
const match = source.match(reactBlock);

if (!match) {
  throw new Error('Could not find the React Native react { } block in android/app/build.gradle');
}

const blockStart = match.index + match[0].length;
const nextBrace = source.indexOf('}', blockStart);
if (nextBrace < 0) {
  throw new Error('React Native react { } block is not closed');
}

const block = source.slice(blockStart, nextBrace);
if (/^\s*debuggableVariants\s*=\s*\[\s*\]\s*$/m.test(block)) {
  console.log('React Native debug bundling is already enabled.');
} else {
  const withoutOldSetting = block.replace(/^\s*debuggableVariants\s*=.*\n/gm, '');
  source = source.slice(0, blockStart) +
    '\n    // Bundle JavaScript into the APK; do not require Metro on the device.\n    debuggableVariants = []\n' +
    withoutOldSetting +
    source.slice(nextBrace);
  fs.writeFileSync(gradlePath, source);
  console.log('Configured debug APK to embed the JavaScript bundle.');
}

const updated = fs.readFileSync(gradlePath, 'utf8');
const updatedStart = updated.match(reactBlock).index + updated.match(reactBlock)[0].length;
const updatedEnd = updated.indexOf('}', updatedStart);
if (!/^\s*debuggableVariants\s*=\s*\[\s*\]\s*$/m.test(updated.slice(updatedStart, updatedEnd))) {
  throw new Error('Failed to verify debuggableVariants = []');
}
