#!/usr/bin/env bash
# Renders every diagram in docs/diagrams/src/*.puml to png/.
#
# Needs Java 17+ and plantuml.jar. Point PLANTUML_JAR at the jar (default: a
# `plantuml` on PATH). The sources use PlantUML's built-in Smetana layout, so
# Graphviz is NOT required.
#
# The diagrams use the Poppins font (SIL OFL). Install it for your user, or
# PlantUML falls back to a default sans-serif and the layout shifts slightly.
#
#   PLANTUML_JAR=~/tools/plantuml.jar ./docs/diagrams/render.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if [[ -n "${PLANTUML_JAR:-}" ]]; then
  run=(java -Djava.awt.headless=true -jar "$PLANTUML_JAR")
else
  run=(plantuml)
fi
export PLANTUML_LIMIT_SIZE=16384  # default 4096 px silently clips tall diagrams
mkdir -p "$here/png"
"${run[@]}" -charset UTF-8 -tpng -o ../png "$here"/src/[0-9]*.puml
echo "rendered $(ls "$here"/png | wc -l) diagrams to $here/png"
