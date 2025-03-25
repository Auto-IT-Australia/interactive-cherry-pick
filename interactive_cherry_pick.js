#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');

function runCommand(command) {
  const result = spawnSync(command, {
    encoding: 'utf8',
    shell: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });

  if (result.error) {
    return null;
  }

  return result.stdout.trim();
}

function getCommitList(featureBranches) {
  console.log(`Getting commits for feature branches: ${featureBranches.join(', ')}`);
  const outputFile = 'commit_list.txt';

  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile); // Clear old commit list
  }

  for (const branch of featureBranches) {
    console.log(`Checking commits for branch: ${branch}`);
    const commits = runCommand(`git log --all --grep="${branch}" --no-merges --format="%H %ci %s" --`);
    if (commits) {
      fs.appendFileSync(outputFile, commits + '\n');
    }
  }

  // Sort commits by date
  const sortedCommits = fs
    .readFileSync(outputFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .sort((a, b) => {
      const dateA = new Date(a.split(' ')[1] + ' ' + a.split(' ')[2]);
      const dateB = new Date(b.split(' ')[1] + ' ' + b.split(' ')[2]);
      return dateA - dateB;
    });

  fs.writeFileSync(outputFile, sortedCommits.join('\n'));
  return outputFile;
}

async function promptUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function cherryPickCommits(commitsFile) {
  const commits = fs.readFileSync(commitsFile, 'utf8').split('\n').filter(Boolean);

  for (const commit of commits) {
    const commitHash = commit.split(' ')[0];
    console.log(`Cherry-picking commit: ${commitHash}`);

    // Cherry-pick the commit with --no-commit to prevent auto-committing
    let result = runCommand(`git cherry-pick --no-commit ${commitHash}`);
    if (!result) {
      console.log(`Error during cherry-pick for commit ${commitHash}. Skipping.`);
      continue;
    }

    // Check for conflicts after attempting cherry-pick
    let cherryPickStatus = runCommand('git status');
    if (cherryPickStatus && cherryPickStatus.includes('Unmerged paths')) {
      console.log('Conflict detected! Please resolve it manually.');

      let resolved = false;
      while (!resolved) {
        // Delay a bit to ensure that Git has fully set the conflict status
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check the status again after delay
        cherryPickStatus = runCommand('git status');
        if (!cherryPickStatus.includes('Unmerged paths')) {
          resolved = true;
          console.log('Conflicts resolved.');
        } else {
          const input = await promptUser("Press 'Enter' after resolving conflicts, or type 'abort' to cancel: ");
          if (input === '') {
            console.log('Conflicts resolved. Proceeding to next commit.');
            resolved = true;
          } else if (input === 'abort') {
            console.log('Aborting cherry-pick process.');
            runCommand('git cherry-pick --abort');
            return;
          }
        }
      }
    } else {
      console.log('No conflicts detected, proceeding to next commit.');
    }
  }
}

async function main() {
  const featureBranchesInput = await promptUser('Enter feature branches (comma separated): ');
  const featureBranches = featureBranchesInput.split(',').map((branch) => branch.trim());

  const commitsFile = getCommitList(featureBranches);
  await cherryPickCommits(commitsFile);
}

main();
