# 历史代码归档

`legacy-code-20260916.zip` 保存从当前源码树移出的 17 个历史文件：

- `old-version/`：14 个早期浏览器版文件，当前 Vue/Node 构建和运行不再引用。
- `test/dbg.mjs`：旧节奏调试脚本，含已过时的服药和重复战斗推进逻辑。
- `test/shots.cjs`、`test/shots-gongfa.cjs`：依赖未声明的 Playwright，使用旧界面选择器且直接连接固定本机端口。

归档保留原相对路径，`manifest.json` 记录各文件的 SHA-256。打包后已逐项读取校验，再从源码目录移除。归档不包含游戏存档。

查看历史实现时，可在项目根目录解压至单独目录：

```powershell
Expand-Archive -LiteralPath 'output/archives/legacy-code-20260916.zip' -DestinationPath 'output/legacy-review'
```

这些脚本不代表当前玩法或测试入口。日常验证使用 `npm test` 和 `npm run build`；节奏分析保留在 `test/pace.mjs`、`test/pace2.mjs`、`test/seek-pace.mjs`。

本轮清理前的活跃源码备份（`output/cleanup-before/`）只保留在本地工作副本中，未纳入仓库。
