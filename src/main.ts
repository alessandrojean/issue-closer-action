import * as core from '@actions/core';
import * as github from '@actions/github';

interface Rule {
  type: 'title' | 'body' | 'both';
  regex: string;
  ignoreCase?: boolean;
  message: string;
}

const ALLOWED_ACTIONS = ['opened', 'edited', 'reopened'];

async function run() {
  try {
    const { actor, eventName, issue, payload, repo } = github.context;

    // Handle the special commands such as lock issue.
    if (eventName === 'issue_comment' && payload.action === 'created') {
      const lockCommand: string = core.getInput('lock-command');
      const commentBody: string = payload.comment.body;
      
      if (!commentBody.startsWith(lockCommand)) {
        return;
      }

      const triageTeamSlug: string = core.getInput('triage-team-slug');

      if (triageTeamSlug.length === 0) {
        return;
      }

      const client = github.getOctokit(
        core.getInput('repo-token', {required: true})
      );

      const allowedMembers = await client.teams.listMembersInOrg({
        org: repo.owner,
        team_slug: triageTeamSlug
      });

      if (allowedMembers.status !== 200) {
        core.info('Failed to fetch the triage team members');
        return;
      }

      if (allowedMembers.data.find(member => member.login === actor)) {
        await client.issues.lock({
          owner: repo.owner,
          repo: repo.repo,
          issue_number: payload.issue.number
        });
      }

      return;
    }

    // Do nothing if it's wasn't a relevant action or it's not an issue
    if (ALLOWED_ACTIONS.indexOf(payload.action) === -1 || !payload.issue) {
      return;
    }
    if (!payload.sender) {
      throw new Error('Internal error, no sender provided by GitHub');
    }

    const rules: string = core.getInput('rules', {required: true});

    // Get client and context
    const client = github.getOctokit(
      core.getInput('repo-token', {required: true})
    );

    const issueMetadata = {
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
    };

    const issueData = await client.issues.get(issueMetadata);

    const ignoreLabel: string = core.getInput('ignoreLabel');
    if (ignoreLabel) {
      if (issueData.data.labels.find((label: any) => label.name === ignoreLabel)) {
        core.info(`Ignoring issue with label ${ignoreLabel}`);
        return;
      }
    }

    const parsedRules = JSON.parse(rules) as Rule[];
    const results = parsedRules
      .map(rule => {
        let texts: string[] = [payload?.issue?.title];

        if (rule.type === 'body') {
          texts = [payload?.issue?.body];
        } else if (rule.type === 'both') {
          texts.push(payload?.issue?.body)
        }

        const regexMatches = check(rule.regex, texts, rule.ignoreCase);
        const failed = regexMatches.length > 0;
        const match = failed ? regexMatches[0][1] : '<No match>';
        const message = rule.message.replace(/\{match\}/g, match);

        if (failed) {
          core.info(`Failed: ${message}`);
          return message;
        } else {
          core.info(`Passed: ${message}`);
        }
      })
      .filter(Boolean);

    if (results.length > 0) {
      // Comment and close if failed any rule
      const infoMessage = payload.action === 'opened'
        ? 'automatically closed'
        : 'not reopened';

      // Avoid commenting about automatic closure if it was already closed
      const shouldComment = (payload.action === 'opened' && issueData.data.state === 'open')
        || (payload.action === 'edited' && issueData.data.state === 'closed');

      if (shouldComment) {
        const message = [`@\${issue.user.login} this issue was ${infoMessage} because:\n`, ...results].join('\n- ');

        await client.issues.createComment({
          ...issueMetadata,
          body: evalTemplate(message, payload),
        });
      }

      await client.issues.update({
        ...issueMetadata,
        state: 'closed',
      });
    } else if (payload.action === 'edited') {
      // Re-open if edited issue is valid and was previously closed by action
      if (issueData.data.closed_by?.login === 'github-actions[bot]') {
        await client.issues.update({
          ...issueMetadata,
          state: 'open',
        });
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

/**
 * Checks all the texts in an array through an RegEx pattern
 * and returns the match results of the ones that matched.
 *
 * @param patternString The RegEx input in string format that will be created.
 * @param texts The text array that will be tested through the pattern.
 * @param ignoreCase If it should be case insensitive.
 * @returns An array of the RegEx match results.
 */
function check(patternString: string, texts: string[] | undefined, ignoreCase: boolean = false): Array<RegExpMatchArray> {
  const pattern = new RegExp(patternString, ignoreCase ? 'i' : undefined);
  return texts
    ?.map(text => {
      // For all the texts (title or body), the input will be
      // normalized to remove any accents or diacritics, and then
      // will be tested by the pattern provided.
      return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .match(pattern);
    })
    ?.filter(Boolean);
}

function evalTemplate(template: string, params: any) {
  return Function(...Object.keys(params), `return \`${template}\``)(...Object.values(params));
}

run();
