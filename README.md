# Module RestApiHelpder
Acts as submodule for git repositories requiring Cherry Health Rest Api Helper functions. 

## Responsibilities
Responsible for:
1. Abstracting incoming rest request 
2. Params cleaning and vetting
3. Error handling

Note: This module does *not* check for permissions. Please refer to *Mdl_Permissions* for that.

## How to
Install submodule in desired location:
`git submodule add https://github.com/Cherry-Health/Mdl_RestApiHelper.git Mdl_RestApiHelper`

Update all submodules in repository:
`git submodule update --remote --merge`