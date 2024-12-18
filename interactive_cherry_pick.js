const { execSync } = require("child_process");
const fs = require("fs");
const readline = require("readline");

// Function to run Git commands
function runCommand(command) {
  try {
    return execSync(command, { encoding: "utf8" });
  } catch (error) {
    console.error("Command failed:", error);
    return null;
  }
}

// Function to get the list of commits for the specified feature branches
function getCommitList(featureBranches) {
  const outputFile = "commit_list.txt";
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile); // Remove old commit list if it exists
  }

  for (const branch of featureBranches) {
    const commits = runCommand(
      `git log --all --grep="${branch}" --no-merges --format="%H %ci %s" --`
    );
    if (commits) {
      fs.appendFileSync(outputFile, commits + "\n");
    }
  }

  // Sort commits by date and write back
  const sortedCommits = fs
    .readFileSync(outputFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .sort((a, b) => {
      const dateA = new Date(a.split(" ")[1] + " " + a.split(" ")[2]);
      const dateB = new Date(b.split(" ")[1] + " " + b.split(" ")[2]);
      return dateA - dateB;
    });

  fs.writeFileSync(outputFile, sortedCommits.join("\n"));
  return outputFile;
}

// Function to handle the cherry-picking process
async function cherryPickCommits(commitsFile) {
  const commits = fs
    .readFileSync(commitsFile, "utf8")
    .split("\n")
    .filter(Boolean);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function promptUser(message) {
    return new Promise((resolve) => {
      rl.question(message, (answer) => resolve(answer));
    });
  }

  (async () => {
    for (const commit of commits) {
      const commitHash = commit.split(" ")[0];
      console.log(`Cherry-picking commit: ${commitHash}`);

      // Cherry-pick the commit, but don't commit automatically
      const result = runCommand(`git cherry-pick --no-commit ${commitHash}`);

      // Check for any conflicts or other issues
      if (result) {
        console.log(result);
      } else {
        // Check if a conflict occurred
        const cherryPickStatus = runCommand("git status");

        if (cherryPickStatus && cherryPickStatus.includes("Unmerged paths")) {
          console.log("Conflict detected, please resolve it manually.");

          const input = await promptUser(
            "Type 'continue' to proceed or 'abort' to cancel: "
          );
          if (input === "continue") {
            // Continue with the next commit (no commit is made automatically)
            runCommand("git cherry-pick --continue");
          } else if (input === "abort") {
            // Abort the cherry-pick process
            runCommand("git cherry-pick --abort");
            break;
          }
        } else {
          console.log("No conflicts, proceeding to next commit.");
        }
      }
    }

    rl.close(); // Close the readline interface
  })();
}

// Function to prompt for the feature branches
function promptForFeatureBranches(rl) {
  return new Promise((resolve) => {
    rl.question("Enter feature branches (comma separated): ", (input) => {
      const featureBranches = input.split(",").map((branch) => branch.trim());
      resolve(featureBranches);
    });
  });
}

// Main execution function
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const featureBranches = await promptForFeatureBranches(rl);
  const commitsFile = getCommitList(featureBranches);
  cherryPickCommits(commitsFile);
}

main();
