STATE ?= qld
PORT  ?= 8731

.PHONY: help update build serve check clean

help:
	@echo "make update [STATE=qld]  重新抓所有外部資料到 data/（會連網）"
	@echo "make build  [STATE=qld]  用 data/ 產生 dist/$(STATE).html（不連網）"
	@echo "make serve  [STATE=qld]  本機預覽 http://127.0.0.1:$(PORT)/$(STATE).html"
	@echo "make check               只重抓郵區清單並健檢，不寫入其他資料"
	@echo "make clean               清掉 dist/ 與 data/raw/"
	@echo ""
	@echo "更新流程：make update -> git diff data/ 看官網改了什麼 -> make build"

update:
	python3 fetch/postcodes.py --keep-raw
	python3 fetch/localities.py $(STATE)
	python3 fetch/boundaries.py $(STATE)
	python3 fetch/basemap.py $(STATE)
	@echo ""
	@echo "資料已更新。請先看 git diff data/ 再 make build。"

build:
	python3 build.py $(STATE)

serve: build
	@echo "http://127.0.0.1:$(PORT)/$(STATE).html"
	cd dist && python3 -m http.server $(PORT)

check:
	python3 fetch/postcodes.py --keep-raw

clean:
	rm -rf dist/*.html data/raw
