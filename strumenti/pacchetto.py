#!/usr/bin/env python3
"""Il pacchetto del modulo, da un commit di master, per chi lo installa con uno strumento che ne controlla la provenienza.

Il pacchetto si fa da un commit di master, mai dalla cartella com'è: così chiunque può rifarlo uguale. Esce una cartella
<id>-<versione>-<commit> col contenuto di modulo/, con module.json che porta il commit in flags.gdr.commit, e accanto
<cartella>.sha256, l'elenco delle impronte SHA-256 dei file, che lo strumento d'installazione può confrontare con quelle
del repository a quel commit.

Uso, da un clone del repository:
  python3 strumenti/pacchetto.py <cartella di uscita> [--commit <sha>]
Senza --commit, l'ultimo commit di origin/master. Serve git, e la rete per aggiornare origin.
"""
import hashlib, json, os, re, subprocess, sys

SORGENTE = "modulo"
# nel pacchetto va solo quello che serve a Foundry: module.json e le cartelle del codice e delle risorse, mai i .md
# (Foundry dà i file dei moduli a chiunque ne sappia l'indirizzo)
CARTELLE = ("scripts/", "styles/", "lang/", "languages/", "templates/", "assets/", "icons/")
NOME_OK = re.compile(r"^[\w ._()',+-]{1,120}$")

def git(*a, testo=True):
    r = subprocess.run(["git", *a], capture_output=True)
    if r.returncode:
        sys.exit(f"git {' '.join(a)}: {r.stderr.decode(errors='replace').strip()}")
    return r.stdout.decode() if testo else r.stdout

args = sys.argv[1:]
commit = None
if "--commit" in args:
    i = args.index("--commit")
    if i + 1 >= len(args) or not re.fullmatch(r"[0-9a-f]{7,40}", args[i + 1]):
        sys.exit("--commit vuole lo sha di un commit (7-40 cifre esadecimali)")
    commit = args[i + 1]; del args[i:i + 2]
if len(args) != 1:
    sys.exit(__doc__)
uscita = os.path.abspath(args[0])     # l'uscita si risolve prima di spostarsi nella radice del clone
radice = git("rev-parse", "--show-toplevel").strip()
os.chdir(radice)
git("fetch", "-q", "origin")
commit = git("rev-parse", "--verify", f"{commit or 'origin/master'}^{{commit}}").strip()
# solo un commit di master, così il pacchetto è quello che tutti possono rifare
if subprocess.run(["git", "merge-base", "--is-ancestor", commit, "origin/master"]).returncode:
    sys.exit(f"il commit {commit[:12]} non è su origin/master: il pacchetto si fa solo da master")
corto = commit[:12]
# il modulo, a quel commit, deve essere quello in cima a master: non una versione vecchia
if git("rev-parse", f"{commit}:{SORGENTE}").strip() != git("rev-parse", f"origin/master:{SORGENTE}").strip():
    sys.exit(f"{SORGENTE} al commit {corto} non è quello in cima a origin/master: si impacchetta solo l'ultima versione")
file = [f for f in git("ls-tree", "-r", "-z", "--name-only", commit, "--", SORGENTE + "/").split("\0") if f]
file = [f for f in file if f[len(SORGENTE) + 1:] == "module.json" or (f[len(SORGENTE) + 1:].startswith(CARTELLE) and not f.lower().endswith(".md"))]
for f in file:
    if any((not NOME_OK.match(x)) or (x in (".", "..")) for x in f[len(SORGENTE) + 1:].split("/")):
        sys.exit(f"{f}: un nome di file non ammesso (solo lettere, numeri, spazi e . _ - ( ) ' , +)")
if f"{SORGENTE}/module.json" not in file:
    sys.exit(f"in {SORGENTE} al commit {corto} non c'è module.json")
man = json.loads(git("show", f"{commit}:{SORGENTE}/module.json"))
mid, versione = man.get("id"), str(man.get("version", ""))
if not mid or not versione:
    sys.exit("module.json senza id o senza version")
nome = f"{mid}-{versione}-{corto}"
dest = os.path.join(uscita, nome)
if os.path.exists(dest) or os.path.exists(dest + ".sha256"):
    sys.exit(f"{dest} c'è già (anche a metà): si toglie, o si sceglie un'altra cartella di uscita")
if not isinstance(man.get("flags", {}), dict) or not isinstance(man.get("flags", {}).get("gdr", {}), dict):
    sys.exit("module.json: flags (e flags.gdr) deve essere un oggetto")
# i file che module.json carica devono stare nelle cartelle che vanno nel pacchetto
citati = [x for k in ("esmodules", "scripts", "styles") for x in (man.get(k) or [])] + [l.get("path") for l in (man.get("languages") or []) if isinstance(l, dict)]
fuori = [x for x in citati if not (isinstance(x, str) and x.startswith(CARTELLE))]
if fuori:
    sys.exit(f"module.json carica file fuori dalle cartelle del pacchetto ({', '.join(map(str, fuori))}): o si spostano, o si aggiunge la cartella a CARTELLE")
if man.get("packs"):
    sys.exit("module.json ha dei compendi (packs): questo pacchetto non li porta")
man.setdefault("flags", {}).setdefault("gdr", {})["commit"] = corto
righe = []
for f in sorted(file):
    rel = f[len(SORGENTE) + 1:]
    dati = (json.dumps(man, ensure_ascii=False, indent=2) + "\n").encode() if rel == "module.json" else git("show", f"{commit}:{f}", testo=False)
    p = os.path.join(dest, *rel.split("/"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as h:
        h.write(dati)
    righe.append(f"{hashlib.sha256(dati).hexdigest()}  {rel}")
with open(dest + ".sha256", "w", encoding="utf-8", newline="\n") as h:
    h.write("\n".join(righe) + "\n")
print(json.dumps({"pacchetto": dest, "elenco": dest + ".sha256", "modulo": mid, "versione": versione, "commit": corto, "file": len(righe)}, ensure_ascii=False, indent=1))
