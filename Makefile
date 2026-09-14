# Makefile for yaformfiller — builds the zip file to submit to
# addons.mozilla.org (AMO) for review.
#
# Usage:
#   make help    -> print this help
#   make dist    -> build yaformfiller-<version>.zip
#   make lint    -> run web-ext lint on the project
#   make clean   -> remove generated zip files

VERSION := $(shell sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json)
NAME    := yaformfiller
ZIPFILE := $(NAME)-$(VERSION).zip

# Exclusions: repository, previous builds, tests, dev files
EXCLUDES := '*.git/*' '*.pi/*' 'test/*' 'test' '*.zip' 'Makefile' '.gitignore' '.pi' '.git'

HELP_FMT = printf "  \033[1m%-8s\033[0m %s\n"

.PHONY: help dist lint clean version check

help:
	@echo "YaFormFiller — available commands:"
	@$(HELP_FMT) help    "print this help"
	@$(HELP_FMT) dist    "build $(ZIPFILE) for submission to AMO"
	@$(HELP_FMT) lint    "run web-ext lint on the project"
	@$(HELP_FMT) version "print the version read from manifest.json"
	@$(HELP_FMT) clean   "remove generated zip files"

dist:
	zip -X -r $(ZIPFILE) . -x $(EXCLUDES)
	unzip -l $(ZIPFILE)
	@echo
	@echo "Created $(ZIPFILE) (version $(VERSION)) — ready for AMO."

lint:
	web-ext lint --source-dir=. --ignore-files '.git*' '*.zip' 'test' '.pi'

check: lint

version:
	@echo $(VERSION)

clean:
	rm -f $(NAME)-*.zip
