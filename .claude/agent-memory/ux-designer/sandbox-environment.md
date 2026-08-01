# Sandbox Environment Notes

## virtiofs wiki-submodule git workaround

In virtiofs sandbox environments, `git -C wiki add` can fail with "insufficient permission for adding an object". Workaround:

1. Clone the wiki to `/tmp/wiki-tmp`
2. Make the Style Guide edits there and commit
3. Set the remote URL from `wiki/.git/config`
4. Push from the temp clone

Afterwards, update the submodule ref in the parent repo as usual (`git add wiki` after syncing the submodule to the pushed commit).
