# Chrome 扩展手动验收指南

## 1. 前置条件

后台服务已启动：

```bash
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8080
```

前端管理台已启动：

```bash
npm run dev -w frontend
```

扩展已构建：

```bash
npm run build:extension
```

可选：生成 zip 分发包。

```bash
npm run package:extension
```

## 2. 生成扩展 Token

打开后台管理台：

```text
http://127.0.0.1:5173/
```

进入设置页，点击生成扩展 Token。生成后复制 Token。

## 3. 加载未打包扩展

1. 打开 Chrome。
2. 进入 `chrome://extensions/`。
3. 打开右上角开发者模式。
4. 点击加载已解压的扩展程序。
5. 选择项目目录下的 `extension/`。

加载成功后应看到扩展名称：

```text
WNACG Downloader
```

## 4. 配置扩展

打开扩展详情或右键扩展图标进入选项页，填写：

```text
Backend URL: http://127.0.0.1:8080
Admin URL:   http://127.0.0.1:5173
Token:       后台设置页生成的 Token
```

保存后打开 popup，应能看到后台连接正常。

## 5. 验收用例

- 后台未启动时，popup 显示连接失败提示。
- 后台启动且 token 正确时，popup 显示连接正常。
- 在支持的 WNACG 页面打开 popup，可以识别当前 manga_id。
- 点击加入队列后，后台任务列表出现对应任务。
- 对已存在或下载中的 ID，popup 能显示当前本地状态。
- token 错误时，扩展接口返回鉴权失败，不创建任务。

## 6. 当前限制

- 扩展只负责识别页面和投喂任务，不参与下载、校验、打包。
- 当前自动化 Chrome 加载验收在本机没有成功展示扩展，需要使用常用 Chrome 手动确认。
- 如要验证完整下载链路，应使用用户明确给出的真实漫画 ID。
