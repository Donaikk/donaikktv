# Donaikk TV

Site de canais e eventos esportivos ao vivo, com login, favoritos, busca e player.
Feito em HTML, CSS e JavaScript puros, sem frameworks nem instalação de dependências.

## Estrutura

```
donaikk-tv/
├── index.html    página (cabeçalho, destaque, grade, barra inferior, player)
├── styles.css    visual: cores, animações e responsivo
├── app.js        lógica: login, banco, dados, grade, destaque, player e atalhos
├── sources.json  endereço da API de canais e eventos (troque aqui, sem mexer no código)
├── db.json       banco de usuários e favoritos
└── README.md     este arquivo
```

## Como rodar

Não abra o `index.html` com duplo clique. O navegador bloqueia a leitura do `db.json` e do `sources.json` quando a página é aberta direto do disco.

Use um servidor local:

```
cd donaikk-tv
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Funcionalidades

**Login e conta**
- Criar conta e entrar, com senha protegida por PBKDF2 (SHA-256, 150 mil iterações).
- O mascote Glimo acompanha o formulário: olha para o campo de usuário, tapa os olhos ao digitar a senha, espia por entre os dedos quando a senha está visível e fica triste em caso de erro.
- Menu da conta com **Baixar db.json** e **Sair**.

**Tela inicial**
- Destaque rotativo a cada 9 segundos, que para quando o mouse está sobre ele.
- Fileiras: **Continuar assistindo**, **Minha lista**, **Ao vivo agora**, **Próximos eventos**, **Em destaque** e **Canais**.
- Cada fileira tem **Ver tudo** para abrir a lista completa.

**Grade e categorias**
- Chips por categoria, mais **Ao vivo**, com contagem de itens.
- Lista completa com ordenação por padrão, nome, horário ou destaques, e botão **Carregar mais** (24 por vez).
- Menu superior e barra inferior no celular: Início, Ao vivo, Próximos, Canais e Minha lista.

**Busca**
- Campo na barra superior. Os resultados aparecem em grade, com busca a cada 350 ms de pausa na digitação ou ao pressionar Enter.

**Player**
- Vários servidores por conteúdo. Botões para recarregar, abrir em nova aba e tela cheia.
- Atalhos: **← →** trocam de canal ou evento dentro da lista aberta, **F** abre tela cheia e **Esc** fecha tudo.
- O foco do teclado fica preso dentro do player enquanto ele está aberto.
- Mostra o programa atual e o seguinte, com barra de progresso, nos canais.

**Dados e atualização**
- A programação é atualizada sozinha a cada 60 segundos, sem interromper o player nem a busca.
- Botão **Atualizar agora** no rodapé.
- Cada chamada à API tem limite de tempo (8 segundos). Se a API falhar, o site mostra os últimos dados salvos ou um botão **Tentar de novo**.
- Se uma das duas fontes falhar, o site mostra a outra e avisa que a atualização foi parcial.

**Favoritos e histórico**
- Favoritos por conta, com botão **Minha lista** no destaque, nos cards e no player.
- **Continuar assistindo** guarda os últimos 12 itens abertos, por conta, no navegador.

## Dados e banco

O `db.json` é a base de usuários e favoritos. Como um navegador não consegue gravar arquivos no servidor, as mudanças ficam salvas no navegador. Para atualizar o arquivo do site:

1. Abra o menu da conta e clique em **Baixar db.json**.
2. Substitua o `db.json` da pasta pelo arquivo baixado.

Ao abrir o site, vale a versão mais recente, comparando a data `updatedAt` do arquivo com a do navegador.

Os dados do navegador ficam separados por endereço. Se o site mudar de domínio ou de porta, as contas e os favoritos somem nesse novo endereço. Por isso o botão de baixar o `db.json` é importante.

## Fontes de conteúdo

Canais e eventos vêm da API configurada em `sources.json`. Para trocar a fonte, edite esse arquivo:

```json
{
  "api": "https://...",
  "proxy": "https://...",
  "endpoints": {
    "channels": "/channels",
    "sports": "/sports",
    "search": "/search?q="
  }
}
```

O `proxy` é usado quando o navegador bloqueia a chamada direta à API (CORS) ou quando ela falha.

## Atenção antes de publicar

- **Licença do conteúdo:** a fonte atual de canais e eventos precisa ser verificada antes de o site ir ao ar. Sem isso, não publique.
- **Login:** as contas ficam no `db.json` e no navegador. Quando o site estiver público, qualquer pessoa consegue baixar o `db.json` e tentar quebrar as senhas offline. Para publicar com segurança, use um backend com autenticação de verdade (por exemplo, Supabase ou Firebase Auth).
- **Player sem sandbox:** os players das fontes externas rodam sem restrição, para que anúncios e reprodução funcionem. Isso permite que a página do player abra pop-ups ou redirecione a aba. O botão **Nova aba** serve para abrir o player fora do site quando isso acontecer.
- **Dados de exemplo:** os canais e eventos mostrados dependem da API. Se ela estiver fora do ar, o site mostra os dados salvos ou a mensagem de erro.

## Próximos passos sugeridos

- Backend de autenticação e termos de uso e política de privacidade (a LGPD se aplica, pois há coleta de usuário e senha).
- Página de programação com grade por horário.
- Filtros por status e campeonato.
- Versão instalável (PWA).
- Testes automatizados (Playwright) para login, busca, favoritos e player.
