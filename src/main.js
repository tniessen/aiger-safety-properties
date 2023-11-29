import assert from 'node:assert';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { lineWrapText } from './utils.js';

const safe = [], unsafe = [];
const outputDir = 'properties';

const recipesURL = new URL(import.meta.resolve('./recipes/'));
for (const recipeName of await readdir(recipesURL)) {
  const dirName = basename(recipeName, '.js');
  await mkdir(`${outputDir}/${dirName}`, { recursive: true });
  const { default: targets } = await import(new URL(recipeName, recipesURL));
  for (const [targetName, [isSafe, build]] of Object.entries(targets)) {
    console.log(dirName, targetName);
    const aag = build();
    assert(aag.includes('\nc\n'));
    assert(/\S\n$/.test(aag));
    const fullAAG = `${aag}${'-'.repeat(80)}\nThis file is part of https://github.com/tniessen/aiger-safety-properties.\n---\nThe output variable is ${isSafe ? 'UNSATISFIABLE' : 'SATISFIABLE'}.\n`;
    const path = `${outputDir}/${dirName}/${targetName}.aag`;
    await writeFile(path, fullAAG);
    (isSafe ? safe : unsafe).push(path);
  }
}

console.log(`\n${lineWrapText(
    `This repository contains ${safe.length + unsafe.length} AIGER files ` +
    `that each have a single output bit, which acts as a bad state detector. ` +
    `In other words, if the safety property represented by the AIGER file ` +
    `holds, then its output variable is unsatisfiable. If the safety ` +
    `property does not hold, then the output variable is satisfied by some ` +
    `input sequence.\n\nOf the ${safe.length + unsafe.length} provided ` +
    `files, ${safe.length} files have an unsatisfiable output variable. The ` +
    `remaining ${unsafe.length} files have a satisfiable output variable. ` +
    `The last line of each \`.aag\` file includes the correct result.`)}`);
