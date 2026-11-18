---
name: k8s-read-only
description: Read-only Kubernetes diagnostics and the suggest-don't-run contract. Activates when work involves kubectl or a Kubernetes cluster — inspecting pods/deployments/services/nodes/namespaces, reading logs or events, debugging crashloops, image-pull or pending-scheduling issues, rollout status, resource pressure, or any "what's wrong with my cluster / why is this pod failing" question. Use it whenever a change to the cluster (apply, delete, scale, restart, patch, drain, etc.) is on the table so the change is SUGGESTED, not executed. Also user-invocable as `/claude-proj-agent:k8s-read-only`.
user-invocable: true
---

# Read-only Kubernetes

Hold to one rule: **run read-only `kubectl` freely, but never run a `kubectl` command that changes cluster state.** Any mutating command is your cue to *suggest*, not execute. Nothing blocks you mechanically — this is a discipline you keep yourself, so the responsibility is on you to recognize a write and hand it to the user instead.

## The contract

1. **Diagnose freely with read-only `kubectl`.** Investigate as deeply as needed.
2. **Never execute a mutation.** For anything that changes state, print the exact command(s) in a ` ```bash ` block and ask the user to run them, with a one-line rationale each.
3. **Don't sidestep the rule.** A mutation stays a mutation even when wrapped: no `kubectl exec`, `proxy`, `port-forward`, `attach`, `debug`, `cp`, or `run`; never pipe a manifest into another tool (`… | kubectl apply -f -`, `kubectl get -o yaml | sh`) to sneak in a write. Use plain, explicit `kubectl` so it is obvious what runs.
4. **Same discipline beyond `kubectl`.** If you reach for `helm upgrade/install/uninstall`, `istioctl install`, `argocd app sync`, `velero restore`, or similar, suggest rather than run. Their read-only forms (`helm list/status/get`, `istioctl analyze/proxy-config`) are fine to run.

## What you may run (read-only)

- `kubectl get` / `describe` / `explain`
- `kubectl logs` (incl. `-f`, `--previous`, `--since`, `-c <container>`)
- `kubectl top nodes|pods`
- `kubectl events`, `kubectl get events --sort-by=.lastTimestamp`
- `kubectl diff` (server dry-run; reports drift, applies nothing)
- `kubectl wait` (blocks on a condition; mutates nothing)
- `kubectl api-resources`, `api-versions`, `version`, `cluster-info`
- Read-only subcommands only: `kubectl rollout status|history`, `kubectl config view|current-context|get-contexts`, `kubectl auth can-i|whoami`

Scope reads to a namespace (`-n <ns>`) or context (`--context <ctx>`) rather than `-A` when you already know where to look.

## What you must SUGGEST, never run

`apply`, `create`, `delete`, `edit`, `patch`, `replace`, `set`, `scale`, `autoscale`, `label`, `annotate`, `taint`, `cordon`, `uncordon`, `drain`, `rollout restart|undo|pause|resume`, `rollback`, `expose`, `certificate approve|deny`, and the escape hatches `exec`, `attach`, `cp`, `port-forward`, `proxy`, `debug`, `run`. When unsure whether a verb changes state, treat it as a mutation and suggest it rather than run it.

When you suggest, be precise and safe:

```bash
# Restart the deployment to pick up the new config (rolling, zero-downtime)
kubectl -n <namespace> rollout restart deployment/<name>
```

Prefer the least-destructive option, name the namespace explicitly, and call out anything irreversible (e.g. `delete pvc`, `delete ns`) before the user runs it.

## Diagnostic recipes

**Crashlooping / restarting pod**
```bash
kubectl -n <ns> get pods                                   # spot the pod + restart count
kubectl -n <ns> describe pod <pod>                         # events, probes, last state, exit code
kubectl -n <ns> logs <pod> -c <container> --previous       # logs from the crashed instance
kubectl -n <ns> get events --sort-by=.lastTimestamp | tail # recent cluster events
```

**Pending / unschedulable pod** — `describe pod` → read the `Events` (insufficient cpu/memory, no matching node, unbound PVC, taints); cross-check `kubectl describe node <n>` and `kubectl top nodes`.

**ImagePullBackOff** — `describe pod` shows the failing image + reason (auth, tag not found, registry unreachable). Confirm the reference, then suggest the fix (correct tag, image pull secret).

**Rollout not progressing** — `kubectl -n <ns> rollout status deployment/<name>`, then `get rs` / `describe` to see which ReplicaSet is stuck and why.

**Service has no endpoints** — `kubectl -n <ns> get endpoints <svc>`; if empty, compare the Service `selector` (`get svc <svc> -o yaml`) against pod labels (`get pods --show-labels`).

**Node pressure** — `kubectl top nodes`, `kubectl describe node <n>` (look at `Conditions`, `Allocated resources`, taints).

Read first, conclude, then — if a change is warranted — hand the user the exact command.
