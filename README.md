# GitHub action to automatically close issues

_This is a modified version of https://github.com/roots/issue-closer-action_

Automatically close issues whose title or body text matches the specified regular expression pattern.

Rules are re-evaluated on issue edits and automatically reopens the issue if the rules pass.

## Installation

To configure the action simply add the following lines to your `.github/main.workflow` workflow file:

```yml
name: Autocloser
on:
  issues:
    types: [opened, edited, reopened]
jobs:
  autoclose:
    runs-on: ubuntu-latest
    steps:
    - name: Autoclose issues
      uses: arkon/issue-closer-action@v3.4
      with:
        repo-token: ${{ secrets.GITHUB_TOKEN }}
        rules: |
          [
            {
              "type": "title",
              "regex": ".*Placeholder title.*",
              "message": "@${issue.user.login} this issue was automatically closed because it did not follow the issue template"
            }
          ]
        triage-team-slug: project-issue-triagers
```

## Inputs

| Name | Description |
| ---- | ----------- |
| `repo-token` | GitHub token |
| `rules` | A JSON-compliant string containing a list of rules, where a rule consists of the content below. |
| `ignoreLabel` | Optional label name. If present, action is skipped. |
| `lock-command` | Optional lock command text. Defaults to "Lock this issue". |
| `triage-team-slug` | Optional team slug from the organization with the members allowed to run commands. If empty, commands are ignored. |

### Rule

```js
{
  type: 'title' | 'body' | 'both';
  regex: string;
  message: string;
  ignoreCase: boolean | undefined;
}
```

- `type`: Part to run regex against.
- `regex`: String compiled to a JavaScript `RegExp`. If matched, the issue is closed.
- `message`: ES2015-style template literal evaluated with the issue webhook payload in context (see [payload example](https://developer.github.com/v3/activity/events/types/#webhook-payload-example-15)). Posted when the issue is closed. You can use `{match}` as a placeholder to the first match.
- `ignoreCase`: Optionally make the regex case insensitive. Defaults to `false`.
