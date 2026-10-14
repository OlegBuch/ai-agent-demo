---
name: k8s-connect
description: Connect a workstation to the CBS dev/QA Kubernetes cluster and set up Lens. Activates when the user wants to add or merge a kubeconfig, point kubectl at the CBS cluster, switch to the rke-dev context, "connect to the cluster", set up cluster access, or install/open Lens (the Kubernetes IDE). CBS-specific — assumes the dev kubeconfig from the infra repo (ansible/fetched/kubeconfig-dev.yaml, context rke-dev). Also user-invocable as `/claude-proj-agent:k8s-connect`.
user-invocable: true
---

# Connect to the CBS cluster

Goal: get the user's `kubectl` (and Lens) talking to the CBS dev/QA cluster. Two parts — **wire up the kubeconfig**, then **set up Lens**.

Anything that edits the user's `~/.kube/config` or installs software is a change to *their machine*: **print the exact command(s) in a ` ```bash ` block for the user to run**, with a one-line rationale — don't run it for them. Read-only checks (does Lens exist, `kubectl get nodes`, `kubectl config get-contexts`) you may run yourself to verify each step.

## 1. Locate the kubeconfig

The CBS dev cluster kubeconfig is checked into the infra repo at `ansible/fetched/kubeconfig-dev.yaml` (fetched during the Ansible `02-post-install.yml` step), and its context is **`rke-dev`**.

- Ask the user where their kubeconfig is, defaulting to `ansible/fetched/kubeconfig-dev.yaml` if you're in the infra repo. Check it exists before going further:

```bash
ls -l ansible/fetched/kubeconfig-dev.yaml
```

- If they don't have it, they fetch a fresh copy from the cluster (see the infra team's dev-access runbook, which is not bundled with this plugin):

```bash
cd ansible && ansible-playbook 02-post-install.yml -i inventory.ini --tags kubeconfig
```

Let `KCFG` below stand for that path.

## 2. Wire it into kubectl

**Merge into the default `~/.kube/config`** (recommended — keeps it available in every shell and lets Lens auto-detect it):

```bash
# Back up first, then merge KCFG into ~/.kube/config
cp ~/.kube/config ~/.kube/config.bak 2>/dev/null || true
KUBECONFIG=~/.kube/config:"$KCFG" kubectl config view --flatten > /tmp/merged-config
mv /tmp/merged-config ~/.kube/config
kubectl config use-context rke-dev
```

PowerShell (Windows):

```powershell
Copy-Item $HOME\.kube\config $HOME\.kube\config.bak -ErrorAction SilentlyContinue
$env:KUBECONFIG="$HOME\.kube\config;$KCFG"; kubectl config view --flatten | Out-File -Encoding utf8 $HOME\.kube\merged
Move-Item -Force $HOME\.kube\merged $HOME\.kube\config
kubectl config use-context rke-dev
```

**Or, no merge** — just point this shell at it (nothing persisted, Lens won't pick it up automatically):

```bash
export KUBECONFIG="$PWD/ansible/fetched/kubeconfig-dev.yaml"   # bash/zsh
kubectl config use-context rke-dev
```

**Verify** (read-only — safe to run):

```bash
kubectl config get-contexts          # rke-dev present and current?
kubectl get nodes                    # dev1/dev2 Ready on v1.31.x+rke2
```

## 3. Set up Lens

Lens is the Kubernetes IDE (a GUI for the cluster). **Check whether it's already installed before suggesting anything:**

```bash
# macOS
ls -d /Applications/Lens.app /Applications/OpenLens.app 2>/dev/null; brew list --cask 2>/dev/null | grep -iE 'lens'
# Linux
command -v lens || snap list 2>/dev/null | grep -i lens || flatpak list 2>/dev/null | grep -i lens
# Windows (PowerShell)
winget list --id Mirantis.Lens 2>$null; Get-ChildItem "$env:LOCALAPPDATA\Programs" -Filter '*Lens*' -ErrorAction SilentlyContinue
```

If it's **already installed**, skip the install — just tell them to open Lens; with the kubeconfig merged in step 2 it appears automatically under the **`rke-dev`** context (otherwise *File → Add Cluster* and paste the kubeconfig).

If it's **not installed**, suggest the install for their OS (then they open it and pick `rke-dev`):

```bash
# macOS
brew install --cask lens
# Windows
winget install Mirantis.Lens
# Linux (snap)
sudo snap install kontena-lens --classic
```

> Lens (k8slens.dev) requires a free **Lens ID** sign-in. If the user wants a sign-in-free, open-source build, suggest **OpenLens** instead (`brew install --cask openlens`, or a release from github.com/MuhammedKalkan/OpenLens).

## After connecting

Once `kubectl get nodes` works, hand off to the read-only diagnostics skill (`/claude-proj-agent:k8s-read-only`) for inspecting the cluster, and to the infra team's dev-access runbook for DNS (`*.proj.local` → node IP) and the platform service URLs (Grafana, Keycloak, Vault, …).
