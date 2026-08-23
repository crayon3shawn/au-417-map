STATE ?= qld
STATES ?= qld nsw vic
PORT  ?= 8731

.PHONY: help update build all portal serve check test clean

help:
	@echo "make update [STATE=qld]  重新抓所有外部資料到 data/（會連網）"
	@echo "make build  [STATE=qld]  用 data/ 產生 dist/$(STATE).html（不連網）"
	@echo "make all                 建全部州頁加入口頁（不連網）"
	@echo "make portal              只建入口頁 dist/index.html"
	@echo "make serve  [STATE=qld]  本機預覽 http://127.0.0.1:$(PORT)/$(STATE).html"
	@echo "make check               只重抓郵區清單並健檢，不寫入其他資料"
	@echo "make test                跑測試（不連網）"
	@echo "make clean               清掉 dist/ 與 data/raw/"
	@echo ""
	@echo "更新流程：make update -> git diff data/ 看官網改了什麼 -> make build"

update:
	python3 fetch/postcodes.py --keep-raw
	python3 fetch/localities.py $(STATE)
	python3 fetch/boundaries.py $(STATE)
	python3 fetch/basemap.py $(STATE)
	python3 fetch/cities.py $(STATE)
	python3 fetch/portal.py
	@echo ""
	@echo "資料已更新。請先看 git diff data/ 再 make build。"

build:
	python3 build.py $(STATE)

all:
	@for s in $(STATES); do python3 build.py $$s | tail -1; done
	python3 build_portal.py | tail -1

portal:
	python3 build_portal.py
	@python3 -m unittest discover -s tests 2>&1 | tail -3

serve: all
	@echo "http://127.0.0.1:$(PORT)/index.html"
	cd dist && python3 -m http.server $(PORT)

test:
	python3 -m unittest discover -s tests -v

check:
	python3 fetch/postcodes.py --keep-raw

clean:
	rm -rf dist/*.html data/raw
