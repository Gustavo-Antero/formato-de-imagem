# Formato de imagem

Extensão do Chrome para baixar imagens no formato que você escolher (PNG, JPG, WEBP ou original), pelo popup ou pelo botão direito do mouse. Funciona também em sites que bloqueiam o menu ou escondem a imagem, como o TikTok.

Visual preto e branco, quadrado, com bordas grossas.

## Recursos

- Escolha o formato do download: Original, PNG, JPG ou WEBP.
- Controle de qualidade para JPG e WEBP.
- Menu do botão direito: "Baixar imagem como..." com os quatro formatos.
- Modo forçado: encontra a imagem mesmo com camadas transparentes por cima e impede o site de cancelar o menu do botão direito.
- Lista todas as imagens da página, inclusive as que são fundo de elemento, para selecionar e baixar várias de uma vez.
- Envia o pedido com o endereço da própria página, o que resolve muitos bloqueios de hotlink.

## Instalação

1. Clone o repositório:

```bash
git clone https://github.com/SEU_USUARIO/formato-de-imagem.git
```

2. Abra `chrome://extensions` no Chrome.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta `formato-de-imagem`.
5. Fixe a extensão na barra do Chrome para abrir o popup com um clique.

Sem Git: clique em **Code > Download ZIP** neste repositório, extraia e siga a partir do passo 2.

## Como usar

**Pelo popup**
1. Abra a página com as imagens e clique no ícone da extensão.
2. Escolha o formato (e a qualidade, se for JPG ou WEBP).
3. Clique nas imagens que quer baixar. Use "Todas" ou "Nenhuma" para agilizar.
4. Clique em **Baixar**.

**Pelo botão direito**
1. Clique com o botão direito sobre a imagem.
2. Vá em **Baixar imagem como...** e escolha o formato.
3. Em sites que bloqueiam, o item aparece como **Baixar imagem daqui como...**.

O ícone da extensão mostra "OK" ou "ERRO" por alguns segundos depois de cada download pelo menu.

## Atualizar

```bash
cd formato-de-imagem
git pull
```

Depois, em `chrome://extensions`, clique no botão de recarregar da extensão.

## Estrutura

```
formato-de-imagem/
├── manifest.json     configuração da extensão (Manifest V3)
├── background.js     menu do botão direito, conversão e download
├── content.js        detecta a imagem sob o cursor e libera o menu
├── popup.html        interface do popup
├── popup.css         estilo preto e branco
├── popup.js          lista de imagens, seleção e download
└── icons/            ícones 16, 32, 48 e 128
```

## Permissões

| Permissão | Para que serve |
| --- | --- |
| `contextMenus` | Criar o menu "Baixar imagem como..." |
| `downloads` | Salvar o arquivo no computador |
| `activeTab` e `scripting` | Listar as imagens da aba aberta |
| `storage` | Lembrar o formato, a qualidade e o modo forçado |
| `declarativeNetRequest` | Enviar o Referer correto ao buscar a imagem |
| Acesso a todos os sites | Buscar imagens de qualquer domínio sem bloqueio de CORS |

A extensão não coleta nem envia dados para nenhum servidor. Tudo acontece no seu navegador.

## Limites

- Vídeos do TikTok não são imagens. A extensão pega capas, fotos e avatares.
- Às vezes o menu forçado não aparece na primeira vez, porque o Chrome monta o menu antes de a extensão terminar de procurar. Clique com o botão direito de novo ou use a lista do popup.
- GIF vira imagem parada ao converter, e SVG sempre baixa no formato original.
- Links assinados que já expiraram podem dar erro.

## Tecnologias

JavaScript puro, Manifest V3, sem dependências.
