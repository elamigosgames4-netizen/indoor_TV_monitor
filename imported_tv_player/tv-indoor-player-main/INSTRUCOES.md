# MK Indoor Player — Instruções curtas

Player de mídia indoor para Android (TVs, TV boxes, celulares e tablets). Uma pasta pública do Google Drive = uma playlist automática.

## Compatibilidade
- **Android 7.0 ou superior** (Expo SDK 57 / API 24). Funciona em TV Weyon, outras TVs Android, TV Boxes, celulares e tablets.
- APK gerado pelo botão **Publish** (canto superior direito). O autostart nativo **só funciona no APK instalado** (não no Expo Go/preview).

## Como usar (1 minuto)
1. No Google Drive, coloque os arquivos **MP4, JPG, JPEG, PNG** direto na pasta (sem subpastas) e compartilhe a pasta como **"Qualquer pessoa com o link"**.
2. (Opcional) Encurte o link da pasta em [tiny.cc](https://tiny.cc).
3. Abra o app → **Configurações** → cole o link → **Salvar e reproduzir**. O app lê a pasta, baixa os arquivos e começa a tocar em loop, ordenado pelo nome (001, 002, 003…).
4. Configurações abrem por toque (toque na tela do player) ou controle remoto (setas/OK).

## O que cada configuração faz
- **Nome do aparelho** — identificação (usada no painel da Etapa 2).
- **Link da pasta** — tiny.cc ou link direto da pasta do Drive. Nada de login Google ou chave de API no aparelho.
- **Duração das fotos** — padrão 10 segundos.
- **Rotação** — 0°, 90°, −90° ou 180°, aplicada a fotos e vídeos sem cortar nem deformar; fica salva após reiniciar.
- **Autostart** — liga → Android inicia → app abre em tela cheia → playlist começa sozinha.
- **Atualizar agora** — força a sincronização na hora.

## Sincronização e offline
- Enquanto o player está aberto e conectado, a pasta é verificada a cada **60 segundos**.
- Arquivos adicionados/substituídos/removidos atualizam a playlist automaticamente (baixa somente o que mudou). A nova lista entra **ao terminar a mídia atual**.
- **Sem internet, pasta vazia ou erro:** continua tocando a última playlist válida salva no aparelho.
- Configurações e mídias ficam salvas: ao reabrir, tudo volta.

## Se o autostart não abrir ao ligar (fabricante)
Algumas marcas bloqueiam apps de iniciar no boot. Ative nas configurações do aparelho:
- **Xiaomi/Redmi/Poco:** Configurações → Permissões → Início automático.
- **TV boxes genéricos (Weyon etc.):** Configurações → Apps → [App] → "Abrir automaticamente" ou "Permitir inicialização automática".
- **Hisense/TCL/Philips:** normalmente funciona sem ajuste; se houver "Modo sinalização/Signage" ou "Inicializar app ao ligar", ative.
- Mantenha o app **não otimizado de bateria** (Configurações → Bateria → Sem otimização) em celulares/tablets.

## Testado x depende do aparelho
**Testado:** leitura real de pasta pública do Drive sem API key, filtro por extensão, ordenação por nome, download real (HTTP 200, MP4 válido), sincronização incremental, loop do player, rotação, fluxo completo de configuração, persistência após reabrir.
**Depende do aparelho físico:** autostart no boot (exige APK + permissão do fabricante), manter tela ligada em modo de espera do fabricante, reprodução em TV real (vídeo/áudio via Expo Go ou APK), blocos de vídeos muito grandes por fabricantes.
