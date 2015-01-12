An extremely hacked together script for helping find dependency relationships between libraries in the `purescript` and `purescript-contrib` orgs.

You need to provide an `api_key.txt` file with a GitHub API access token.

Running `node go` will just create a `graph.json` containing the dependency edges.

To avoid hammering the API the responses are cached in `/cache` on the first run, from then on files will be loaded from there if present, so that should probably be deleted each time you come back to this tool.

Running `node go some-name` will list the dependants of `some-name`, along with related dependants. For example:

```
> node go purescript-maps

purescript-argonaut
    purescript-sets
purescript-graphs
    purescript-sets
purescript-sets
```

Meaning if we're making a breaking change release of `purescript-maps` then we also need to update `purescript-argonaut`, `purescript-graphs`, and `purescript-sets`, but we shouldn't update `purescript-argonaut` or `purescript-graphs` until `purescript-sets` has also had a version bump first.

I should probably rewrite this in PureScript so I can take advantage of `purescript-graphs` and just output a toposorted list instead...
