# Finto Windows 代码签名

正式发布建议使用受信任 CA 签发的 Windows Authenticode 代码签名证书。证书私钥绝不提交到仓库，也不要放进安装包。

## GitHub 发布签名

在 GitHub 仓库的 Actions secrets 中配置：

- `WINDOWS_CERTIFICATE_BASE64`：PFX 证书文件的 Base64 文本。
- `WINDOWS_CERTIFICATE_PASSWORD`：PFX 密码。

发布工作流会把证书临时导入 GitHub Windows runner 的当前用户证书库，先签名 `Finto.exe`，再签名安装包，并使用 DigiCert 时间戳服务校验签名。没有配置这两个 secret 时，工作流仍可发布，但会明确生成未签名版本。

## 本机构建签名

将证书先导入“当前用户 / 个人”证书库后，运行：

```powershell
.\packaging\Build-Windows.ps1 -Installer -SignTool "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe" -CertificateThumbprint "你的证书指纹"
```

签名不是身份注册本身。Windows SmartScreen 的信誉会随已签名版本被正常下载和使用逐步建立。
